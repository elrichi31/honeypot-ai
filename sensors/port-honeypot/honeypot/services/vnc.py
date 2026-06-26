import asyncio

VNC_CHALLENGE = bytes(range(16))  # 00 01 02 ... 0f — fixed so responses are crackable offline


async def handle_vnc(reader, writer, src_ip, src_port, port, send_fn):
    extra: dict = {"protocolName": "vnc"}
    username = None
    password = None
    event_type = "connect"
    raw = b""

    async def read_challenge_response():
        nonlocal event_type, username, password, raw
        resp = await asyncio.wait_for(reader.read(16), timeout=5)
        raw += resp
        if len(resp) == 16:
            event_type = "auth"
            username = ""
            password = resp.hex()
            extra["vncChallengeResponseHex"] = resp.hex()
            extra["vncChallengeHex"] = VNC_CHALLENGE.hex()

    try:
        writer.write(b"RFB 003.008\n")
        await writer.drain()

        client_ver = await asyncio.wait_for(reader.read(12), timeout=5)
        raw += client_ver
        ver_str = client_ver.decode("latin-1", "replace").strip()
        if ver_str:
            extra["clientVersion"] = ver_str

        is_33 = "003.003" in ver_str or "003.005" in ver_str

        if is_33:
            extra["authType"] = "vnc-auth"
            writer.write(b"\x00\x00\x00\x02")
            await writer.drain()
            writer.write(VNC_CHALLENGE)
            await writer.drain()
            await read_challenge_response()
        else:
            writer.write(b"\x01\x02")
            await writer.drain()
            sec = await asyncio.wait_for(reader.read(1), timeout=5)
            raw += sec
            if sec == b"\x02":
                extra["authType"] = "vnc-auth"
                writer.write(VNC_CHALLENGE)
                await writer.drain()
                await read_challenge_response()
            elif sec == b"\x01":
                extra["authType"] = "none"
    except (asyncio.TimeoutError, Exception):
        pass

    await asyncio.get_event_loop().run_in_executor(
        None, send_fn, src_ip, src_port, port, raw.hex(), event_type, username, password, extra
    )
