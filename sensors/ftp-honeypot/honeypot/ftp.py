import asyncio
import hashlib
import logging
import secrets
import time

from .config import PASV_PORT_MIN, PASV_PORT_MAX, MAX_UPLOAD_BYTES
from .identity import FTP_BANNER, FAKE_LISTING, DECOY_CATALOG, get_decoy_content
from .ingest import send, save_upload

# Per-process secret for honeytoken derivation — never stored/logged.
_TOKEN_SECRET = secrets.token_bytes(32)


def _honeytoken(src_ip: str) -> str:
    """Deterministic per-IP honeytoken: HMAC-SHA256(ip+ts_hour, secret), hex[0:16]."""
    import hmac
    ts_hour = str(int(time.time()) // 3600)
    mac = hmac.new(_TOKEN_SECRET, f"{src_ip}:{ts_hour}".encode(), hashlib.sha256)
    return mac.hexdigest()[:16]

log = logging.getLogger("ftp-honeypot")

_pasv_cursor = PASV_PORT_MIN


def _next_pasv_port() -> int:
    global _pasv_cursor
    port = _pasv_cursor
    _pasv_cursor += 1
    if _pasv_cursor > PASV_PORT_MAX:
        _pasv_cursor = PASV_PORT_MIN
    return port


class DataChannel:
    def __init__(self):
        self.server = None
        self.reader = None
        self.writer = None
        self.port = None
        self.active_addr = None
        self._ready = asyncio.Event()

    async def open_pasv(self) -> int:
        self.port = _next_pasv_port()

        async def _on_conn(reader, writer):
            self.reader, self.writer = reader, writer
            self._ready.set()

        self.server = await asyncio.start_server(_on_conn, "0.0.0.0", self.port)
        return self.port

    def set_active(self, host: str, port: int):
        self.active_addr = (host, port)

    async def _ensure_active(self):
        if self.active_addr and not self.writer:
            self.reader, self.writer = await asyncio.open_connection(*self.active_addr)
            self._ready.set()

    async def recv_all(self, cap: int) -> bytes:
        await self._ensure_active()
        try:
            await asyncio.wait_for(self._ready.wait(), timeout=30)
        except asyncio.TimeoutError:
            return b""
        buf = b""
        while len(buf) < cap:
            try:
                chunk = await asyncio.wait_for(self.reader.read(65536), timeout=30)
            except asyncio.TimeoutError:
                break
            if not chunk:
                break
            buf += chunk
        return buf[:cap]

    async def send(self, data: bytes):
        await self._ensure_active()
        if self.active_addr:
            await asyncio.wait_for(self._ready.wait(), timeout=30)
        else:
            try:
                await asyncio.wait_for(self._ready.wait(), timeout=30)
            except asyncio.TimeoutError:
                return
        try:
            self.writer.write(data)
            await self.writer.drain()
        except Exception:
            pass

    async def close(self):
        for obj in (self.writer,):
            try:
                if obj:
                    obj.close()
            except Exception:
                pass
        try:
            if self.server:
                self.server.close()
        except Exception:
            pass


async def handle(reader, writer, sensor_ip: str):
    peer = writer.get_extra_info("peername")
    src_ip, src_port = (peer[0], peer[1]) if peer else ("unknown", 0)
    log.info("connect %s:%d", src_ip, src_port)

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, send, "connect", src_ip, src_port)

    username = None
    authed = False
    data_chan: DataChannel | None = None

    async def reply(text: str):
        writer.write(text.encode())
        await writer.drain()

    try:
        await reply(FTP_BANNER)

        while True:
            try:
                raw = await asyncio.wait_for(reader.readline(), timeout=120)
            except asyncio.TimeoutError:
                await reply("421 Timeout.\r\n")
                break
            if not raw:
                break
            line = raw.decode(errors="replace").strip()
            if not line:
                continue
            upper = line.upper()

            if upper.startswith("USER "):
                username = line[5:]
                await reply("331 Please specify the password.\r\n")

            elif upper.startswith("PASS "):
                password = line[5:]
                log.info("auth %s | %s from %s", username, password, src_ip)
                await loop.run_in_executor(
                    None, send, "auth", src_ip, src_port, username or "", password
                )
                if password:
                    authed = True
                    await reply("230 Login successful.\r\n")
                else:
                    await reply("530 Login incorrect.\r\n")

            elif not authed and upper not in ("QUIT", "SYST", "FEAT", "HELP", "NOOP"):
                await reply("530 Please login with USER and PASS.\r\n")

            elif upper == "SYST":
                await reply("215 UNIX Type: L8\r\n")
            elif upper.startswith("FEAT"):
                await reply("211-Features:\r\n EPSV\r\n PASV\r\n SIZE\r\n UTF8\r\n211 End\r\n")
            elif upper == "PWD":
                await reply('257 "/" is the current directory\r\n')
            elif upper.startswith("CWD ") or upper == "CDUP":
                await reply("250 Directory successfully changed.\r\n")
            elif upper.startswith("TYPE "):
                await reply("200 Switching to Binary mode.\r\n")
            elif upper.startswith("MODE ") or upper.startswith("STRU "):
                await reply("200 OK.\r\n")
            elif upper == "OPTS UTF8 ON":
                await reply("200 Always in UTF8 mode.\r\n")

            elif upper.startswith("PASV"):
                if data_chan:
                    await data_chan.close()
                data_chan = DataChannel()
                port = await data_chan.open_pasv()
                ip_parts = (sensor_ip or "127.0.0.1").split(".")
                if len(ip_parts) != 4:
                    ip_parts = ["127", "0", "0", "1"]
                p1, p2 = port >> 8, port & 0xFF
                await reply(f"227 Entering Passive Mode ({','.join(ip_parts)},{p1},{p2}).\r\n")

            elif upper.startswith("EPSV"):
                if data_chan:
                    await data_chan.close()
                data_chan = DataChannel()
                port = await data_chan.open_pasv()
                await reply(f"229 Entering Extended Passive Mode (|||{port}|).\r\n")

            elif upper.startswith("PORT "):
                try:
                    nums = [int(x) for x in line[5:].split(",")]
                    host = ".".join(str(n) for n in nums[:4])
                    dport = (nums[4] << 8) + nums[5]
                    data_chan = DataChannel()
                    data_chan.set_active(host, dport)
                    await reply("200 PORT command successful. Consider using PASV.\r\n")
                except Exception:
                    await reply("501 Illegal PORT command.\r\n")

            elif upper.startswith("LIST") or upper.startswith("NLST"):
                await reply("150 Here comes the directory listing.\r\n")
                if data_chan:
                    await data_chan.send(FAKE_LISTING.encode())
                    await data_chan.close()
                    data_chan = None
                await reply("226 Directory send OK.\r\n")

            elif upper.startswith("STOR ") or upper.startswith("APPE "):
                filename = line[5:].strip() or "upload.bin"
                await reply("150 Ok to send data.\r\n")
                content = b""
                if data_chan:
                    content = await data_chan.recv_all(MAX_UPLOAD_BYTES)
                    await data_chan.close()
                    data_chan = None
                if content:
                    info = await loop.run_in_executor(None, save_upload, content, filename, src_ip, src_port)
                    await loop.run_in_executor(
                        None, send, "file.upload", src_ip, src_port, username, None,
                        {"command": line, **info},
                    )
                else:
                    await loop.run_in_executor(
                        None, send, "command", src_ip, src_port, username, None, {"command": line},
                    )
                await reply("226 Transfer complete.\r\n")

            elif upper.startswith("RETR "):
                filename = line[5:].strip()
                base = filename.rsplit("/", 1)[-1]
                decoy = get_decoy_content(base)
                token = _honeytoken(src_ip) if decoy is not None else None
                await loop.run_in_executor(
                    None, send, "file.download", src_ip, src_port, username, None,
                    {"command": line, **({"honeytokenServed": token} if token else {})},
                )
                if token and decoy is not None:
                    # Emit honeytoken.served so ingest-api can correlate future reuse
                    await loop.run_in_executor(
                        None, send, "honeytoken.served", src_ip, src_port, username, None,
                        {"file": base, "token": token},
                    )
                if decoy is not None and data_chan:
                    # Inject unique token into credential-bearing decoys
                    if token and ".credentials" in base:
                        decoy = decoy + f"\n# token:{token}\n"
                    await reply("150 Opening BINARY mode data connection.\r\n")
                    await data_chan.send(decoy.encode())
                    await data_chan.close()
                    data_chan = None
                    await reply("226 Transfer complete.\r\n")
                else:
                    await reply("550 Failed to open file.\r\n")

            elif upper.startswith(("DELE ", "RMD ", "MKD ", "RNFR ", "RNTO ")):
                await loop.run_in_executor(
                    None, send, "command", src_ip, src_port, username, None, {"command": line},
                )
                await reply("550 Permission denied.\r\n")

            elif upper.startswith("SIZE "):
                name = line[5:].strip().rsplit("/", 1)[-1]
                entry = DECOY_CATALOG.get(name)
                if entry:
                    await reply(f"213 {entry[0]}\r\n")
                else:
                    await reply("550 No such file or directory.\r\n")

            elif upper == "NOOP":
                await reply("200 NOOP ok.\r\n")
            elif upper.startswith("QUIT"):
                await reply("221 Goodbye.\r\n")
                break
            else:
                await loop.run_in_executor(
                    None, send, "command", src_ip, src_port, username, None, {"command": line},
                )
                await reply("502 Command not implemented.\r\n")

    except (ConnectionResetError, BrokenPipeError):
        pass
    except Exception as exc:
        log.error("error from %s: %s", src_ip, exc)
    finally:
        if data_chan:
            await data_chan.close()
        try:
            writer.close()
        except Exception:
            pass
