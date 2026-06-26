import asyncio
import time

_START_TIME = time.time()


def _redis_info() -> str:
    uptime = int(time.time() - _START_TIME)
    return (
        "# Server\r\nredis_version:7.2.4\r\nredis_mode:standalone\r\nos:Linux 5.15.0-91-generic x86_64\r\n"
        f"arch_bits:64\r\nprocess_id:1\r\ntcp_port:6379\r\nuptime_in_seconds:{uptime}\r\n"
        "# Clients\r\nconnected_clients:1\r\n"
        "# Memory\r\nused_memory_human:1.04M\r\nmaxmemory_human:0B\r\n"
        "# Keyspace\r\ndb0:keys=14,expires=2,avg_ttl=0\r\n"
    )


def _redis_reply(cmd: str, args: list[str]) -> bytes:
    c = cmd.upper()
    if c == "PING":
        return b"+PONG\r\n" if not args else b"$%d\r\n%s\r\n" % (len(args[0]), args[0].encode())
    if c == "INFO":
        body = _redis_info().encode()
        return b"$%d\r\n%s\r\n" % (len(body), body)
    if c == "COMMAND":
        return b"*0\r\n"
    if c in ("AUTH", "SELECT", "CONFIG", "CLIENT", "HELLO"):
        return b"+OK\r\n"
    if c in ("GET", "HGET"):
        return b"$-1\r\n"
    if c in ("SET", "DEL", "EXPIRE", "FLUSHALL", "FLUSHDB", "KEYS"):
        return b"+OK\r\n"
    if c == "KEYS":
        return b"*0\r\n"
    if c == "QUIT":
        return b"+OK\r\n"
    return b"-ERR unknown command '%s'\r\n" % c.encode()


def _parse_resp(buf: bytes) -> list[str]:
    text = buf.decode("latin-1", "replace").strip()
    if not text:
        return []
    if text[0] == "*":
        toks, lines = [], text.split("\r\n")
        i = 1
        while i < len(lines):
            if lines[i].startswith("$"):
                i += 1
                if i < len(lines):
                    toks.append(lines[i])
            i += 1
        return toks
    return text.split()


async def handle_redis(reader, writer, src_ip, src_port, port, send_fn):
    captured: list[str] = []
    try:
        for _ in range(20):
            data = await asyncio.wait_for(reader.read(4096), timeout=8)
            if not data:
                break
            toks = _parse_resp(data)
            if not toks:
                continue
            captured.append(" ".join(toks)[:200])
            writer.write(_redis_reply(toks[0], toks[1:]))
            await writer.drain()
            if toks[0].upper() == "QUIT":
                break
    except (asyncio.TimeoutError, Exception):
        pass
    extra = {"protocolName": "redis", "commands": captured}
    await asyncio.get_event_loop().run_in_executor(
        None, send_fn, src_ip, src_port, port, "", "connect", None, None, extra
    )
