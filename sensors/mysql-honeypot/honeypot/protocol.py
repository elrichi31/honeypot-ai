import asyncio
import logging
import os
import struct

from .ingest import send

log = logging.getLogger("mysql-honeypot")

_conn_counter = 0

MYSQL_ACCEPT_AUTH = os.getenv("MYSQL_ACCEPT_AUTH", "").lower() in ("1", "true", "yes")

# Decoy data served in accept mode
_DECOY_VERSION = b"5.7.44-log"
_DECOY_DATABASES = ["information_schema", "mysql", "performance_schema", "appdb"]
_DECOY_USER = os.getenv("SENSOR_HOSTNAME", "web-prod-01").split("-")[0] + "_app"

# Cap commands per session in accept mode to prevent abuse
_MAX_COMMANDS = 20


def _next_conn_id() -> int:
    global _conn_counter
    _conn_counter += 1
    return _conn_counter


def server_greeting(conn_id: int) -> bytes:
    """MySQL 5.7 Protocol 10 server greeting packet."""
    scramble = os.urandom(20)
    payload = (
        b"\x0a"
        + _DECOY_VERSION + b"\x00"
        + struct.pack("<I", conn_id)
        + scramble[:8] + b"\x00"
        + struct.pack("<H", 0xF7FF & ~0x0800)
        + bytes([33])
        + struct.pack("<H", 0x0002)
        + struct.pack("<H", 0x0200)
        + bytes([21])
        + b"\x00" * 10
        + scramble[8:] + b"\x00"
        + b"mysql_native_password\x00"
    )
    header = struct.pack("<I", len(payload))[:3] + b"\x00"
    return header + payload


def _ok_packet(seq: int = 2) -> bytes:
    payload = b"\x00\x00\x00\x02\x00\x00\x00"
    header = struct.pack("<I", len(payload))[:3] + bytes([seq])
    return header + payload


def _text_result(seq: int, rows: list[list[bytes]]) -> bytes:
    """Minimal MySQL text protocol result set (single-column rows)."""
    packets = b""

    def _lc_str(s: bytes) -> bytes:
        return bytes([len(s)]) + s

    # Field count
    fc_payload = bytes([len(rows[0]) if rows else 1])
    packets += struct.pack("<I", len(fc_payload))[:3] + bytes([seq]) + fc_payload
    seq += 1

    # Column defs (one per column of first row)
    for col_idx in range(len(rows[0]) if rows else 1):
        col = (
            _lc_str(b"def") + _lc_str(b"") + _lc_str(b"") +
            _lc_str(b"result") + _lc_str(b"result") +
            b"\x0c" + b"\x21\x00" + b"\x00\x01\x00\x00" + b"\xfd\x00\x00\x00\x00"
        )
        packets += struct.pack("<I", len(col))[:3] + bytes([seq]) + col
        seq += 1

    # EOF
    eof = b"\xfe\x00\x00\x02\x00"
    packets += struct.pack("<I", len(eof))[:3] + bytes([seq]) + eof
    seq += 1

    # Rows
    for row in rows:
        row_payload = b"".join(_lc_str(cell) for cell in row)
        packets += struct.pack("<I", len(row_payload))[:3] + bytes([seq]) + row_payload
        seq += 1

    # Final EOF
    packets += struct.pack("<I", len(eof))[:3] + bytes([seq]) + eof
    return packets


def _handle_query(query: bytes) -> bytes:
    """Return a minimal response to common recon queries in accept mode."""
    q = query.decode(errors="replace").strip().rstrip(";")
    ql = q.lower()
    if ql in ("select @@version", "select @@version_comment", "select version()"):
        return _text_result(1, [[_DECOY_VERSION]])
    if ql == "show databases":
        return _text_result(1, [[db.encode()] for db in _DECOY_DATABASES])
    if ql in ("select user()", "select current_user()"):
        return _text_result(1, [[f"{_DECOY_USER}@localhost".encode()]])
    if ql.startswith("show tables"):
        return _text_result(1, [[b"users"], [b"orders"], [b"sessions"]])
    if ql.startswith("select") or ql.startswith("show"):
        return _text_result(1, [[b""]])
    # For non-SELECT: return OK
    return _ok_packet(2)


def error_packet(code: int, msg: bytes, sql_state: bytes = b"#28000", seq: int = 2) -> bytes:
    payload = b"\xff" + struct.pack("<H", code) + sql_state + msg
    header = struct.pack("<I", len(payload))[:3] + bytes([seq])
    return header + payload


def parse_database(auth_data: bytes, username_end: int) -> str | None:
    if len(auth_data) < 4:
        return None
    caps = struct.unpack("<I", auth_data[:4])[0]
    if not (caps & 0x0008):
        return None

    offset = username_end
    if offset >= len(auth_data):
        return None

    first_byte = auth_data[offset]
    if first_byte < 0xFB:
        offset += 1 + first_byte
    elif first_byte == 0xFC and offset + 3 <= len(auth_data):
        auth_len = struct.unpack("<H", auth_data[offset + 1:offset + 3])[0]
        offset += 3 + auth_len
    elif first_byte == 0xFD and offset + 4 <= len(auth_data):
        auth_len = struct.unpack("<I", auth_data[offset + 1:offset + 4] + b"\x00")[0]
        offset += 4 + auth_len
    elif first_byte == 0xFE and offset + 9 <= len(auth_data):
        auth_len = struct.unpack("<Q", auth_data[offset + 1:offset + 9])[0]
        offset += 9 + auth_len
    else:
        return None

    if offset >= len(auth_data):
        return None

    null_pos = auth_data.find(b"\x00", offset)
    if null_pos < offset:
        raw = auth_data[offset:].decode(errors="replace").rstrip("\x00")
    else:
        raw = auth_data[offset:null_pos].decode(errors="replace")

    return raw if raw else None


def _has_password(auth_data: bytes, username_end: int) -> bool:
    """Return True if auth_response is non-empty."""
    if username_end >= len(auth_data):
        return False
    first = auth_data[username_end]
    return first != 0


async def handle(reader, writer):
    peer = writer.get_extra_info("peername")
    src_ip, src_port = (peer[0], peer[1]) if peer else ("unknown", 0)
    log.info("connect %s:%d", src_ip, src_port)

    conn_id = _next_conn_id()
    loop = asyncio.get_event_loop()
    try:
        writer.write(server_greeting(conn_id))
        await writer.drain()

        await loop.run_in_executor(None, send, "connect", src_ip, src_port)

        hdr = await asyncio.wait_for(reader.read(4), timeout=15)
        if len(hdr) < 4:
            return

        pkt_len = struct.unpack("<I", hdr[:3] + b"\x00")[0]
        if pkt_len > 16384:
            return

        auth_data = await asyncio.wait_for(reader.read(pkt_len), timeout=15)

        if pkt_len == 32:
            caps = struct.unpack("<I", auth_data[:4])[0] if len(auth_data) >= 4 else 0
            if caps & 0x0800:
                err_msg = b"SSL connection error: SSL is not enabled on the server"
                writer.write(error_packet(2026, err_msg, sql_state=b"#HY000"))
                await writer.drain()
                hdr2 = await asyncio.wait_for(reader.read(4), timeout=15)
                if len(hdr2) < 4:
                    return
                pkt_len = struct.unpack("<I", hdr2[:3] + b"\x00")[0]
                if pkt_len < 32 or pkt_len > 16384:
                    return
                auth_data = await asyncio.wait_for(reader.read(pkt_len), timeout=15)
            else:
                return

        offset = 32
        if len(auth_data) < offset:
            return

        null_pos = auth_data.find(b"\x00", offset)
        username = auth_data[offset:null_pos].decode(errors="replace") if null_pos >= offset else ""
        username_end = (null_pos + 1) if null_pos >= offset else (offset + 1)

        database = parse_database(auth_data, username_end)
        has_pwd = _has_password(auth_data, username_end)
        pwd_label = "YES" if has_pwd else "NO"

        log.info("auth user='%s' db='%s' from %s", username, database, src_ip)
        await loop.run_in_executor(None, send, "auth", src_ip, src_port, username, database)

        if MYSQL_ACCEPT_AUTH:
            writer.write(_ok_packet(seq=2))
            await writer.drain()
            # Mini command loop for recon capture
            for _ in range(_MAX_COMMANDS):
                try:
                    hdr3 = await asyncio.wait_for(reader.read(4), timeout=30)
                    if not hdr3 or len(hdr3) < 4:
                        break
                    cmd_len = struct.unpack("<I", hdr3[:3] + b"\x00")[0]
                    if cmd_len < 1 or cmd_len > 65536:
                        break
                    cmd_data = await asyncio.wait_for(reader.read(cmd_len), timeout=30)
                    if not cmd_data:
                        break
                    cmd_type = cmd_data[0]
                    if cmd_type == 0x03:  # COM_QUERY
                        query = cmd_data[1:]
                        await loop.run_in_executor(
                            None, send, "command", src_ip, src_port, username, database,
                            {"query": query.decode(errors="replace")[:500]},
                        )
                        resp = _handle_query(query)
                        writer.write(resp)
                        await writer.drain()
                    elif cmd_type == 0x01:  # COM_QUIT
                        break
                    else:
                        writer.write(_ok_packet(1))
                        await writer.drain()
                except (asyncio.TimeoutError, Exception):
                    break
        else:
            err_msg = f"Access denied for user '{username}'@'{src_ip}' (using password: {pwd_label})".encode()
            writer.write(error_packet(1045, err_msg))
            await writer.drain()

    except (asyncio.TimeoutError, ConnectionResetError, BrokenPipeError):
        pass
    except Exception as exc:
        log.error("error from %s: %s", src_ip, exc)
    finally:
        try:
            writer.close()
        except Exception:
            pass
