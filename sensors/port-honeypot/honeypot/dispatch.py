import asyncio
import logging

from .config import BANNERS
from .ingest import send
from .services.vnc import handle_vnc
from .services.rdp import handle_rdp
from .services.redis import handle_redis
from .services.http import handle_httpish
from .services.mongodb import handle_mongodb

log = logging.getLogger("port-honeypot")


def make_handler(port: int):
    async def handle(reader, writer):
        peer = writer.get_extra_info("peername")
        src_ip, src_port = (peer[0], peer[1]) if peer else ("unknown", 0)
        log.info("port %-5d | %s:%d", port, src_ip, src_port)

        try:
            if port == 5900:
                await handle_vnc(reader, writer, src_ip, src_port, port, send)
            elif port == 3389:
                await handle_rdp(reader, writer, src_ip, src_port, port, send)
            elif port == 6379:
                await handle_redis(reader, writer, src_ip, src_port, port, send)
            elif port in {81, 2375, 8888, 9090, 9200}:
                await handle_httpish(reader, writer, src_ip, src_port, port, send)
            elif port == 27017:
                await handle_mongodb(reader, writer, src_ip, src_port, port, send)
            else:
                banner = BANNERS.get(port)
                if banner:
                    try:
                        writer.write(banner)
                        await writer.drain()
                    except Exception:
                        pass
                client_data = b""
                try:
                    client_data = await asyncio.wait_for(reader.read(4096), timeout=5)
                except (asyncio.TimeoutError, Exception):
                    pass
                await asyncio.get_event_loop().run_in_executor(
                    None, send, src_ip, src_port, port, client_data.hex()
                )
        finally:
            try:
                writer.close()
                await writer.wait_closed()
            except Exception:
                pass

    return handle
