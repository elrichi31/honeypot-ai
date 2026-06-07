import { buildApp } from './app.js';
import { initCron } from './lib/cron.js';
import { initProtocolBatch, stopProtocolBatch } from './lib/protocol-batch.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    initCron(app.prisma);
    initProtocolBatch(app.prisma);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  // Graceful shutdown: on deploy/restart (SIGTERM) or Ctrl-C (SIGINT), flush the
  // in-memory protocol-hit queue and close the server + DB connections cleanly
  // instead of dropping in-flight requests and queued events.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.info(`Received ${signal}, shutting down gracefully...`);
    try {
      await stopProtocolBatch();   // flush queued protocol hits
      await app.close();           // runs plugin onClose hooks (prisma/redis disconnect)
    } catch (err) {
      app.log.error(err, 'Error during graceful shutdown');
    } finally {
      process.exit(0);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start();
