import asyncio
from typing import Any


async def handle_mongodb(reader, writer, src_ip, src_port, port, send_fn):
    raw = b""
    extra: dict[str, Any] = {"protocolName": "mongodb"}
    try:
        raw = await asyncio.wait_for(reader.read(4096), timeout=5)
        if len(raw) >= 16:
            extra["messageLength"] = int.from_bytes(raw[0:4], "little", signed=False)
            extra["requestId"] = int.from_bytes(raw[4:8], "little", signed=True)
            extra["opCode"] = int.from_bytes(raw[12:16], "little", signed=True)
        if b"admin.$cmd" in raw:
            extra["targetNamespace"] = "admin.$cmd"
        writer.write(b"\x21\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\x00\xd4\x07\x00\x00\x00\x00\x00\x00")
        await writer.drain()
    except (asyncio.TimeoutError, Exception):
        pass
    await asyncio.get_event_loop().run_in_executor(
        None, send_fn, src_ip, src_port, port, raw.hex(), "connect", None, None, extra
    )
