import asyncio


async def handle_rdp(reader, writer, src_ip, src_port, port, send_fn):
    extra: dict = {"protocolName": "rdp"}
    username = None
    event_type = "connect"
    raw = b""
    try:
        raw = await asyncio.wait_for(reader.read(4096), timeout=5)
        text = raw.decode("latin-1", "replace")
        marker = "mstshash="
        idx = text.find(marker)
        if idx != -1:
            end = text.find("\r", idx)
            if end == -1:
                end = text.find("\n", idx)
            if end == -1:
                end = idx + len(marker) + 64
            user = text[idx + len(marker):end].strip()
            if user:
                username = user
                event_type = "auth"
                extra["mstshash"] = user
        if b"\x01\x00\x08\x00" in raw:
            i = raw.find(b"\x01\x00\x08\x00")
            if i + 8 <= len(raw):
                flags = int.from_bytes(raw[i + 4:i + 8], "little")
                wanted = []
                if flags == 0: wanted.append("standard-rdp")
                if flags & 0x1: wanted.append("tls")
                if flags & 0x2: wanted.append("credssp")
                if flags & 0x8: wanted.append("rdstls")
                if wanted:
                    extra["requestedSecurity"] = ",".join(wanted)
    except (asyncio.TimeoutError, Exception):
        pass
    await asyncio.get_event_loop().run_in_executor(
        None, send_fn, src_ip, src_port, port, raw.hex(), event_type, username, None, extra
    )
