import { buildApp } from './app.js';
import { initCron } from './lib/cron.js';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function start() {
  const app = await buildApp();

  try {
    await app.listen({ port: PORT, host: HOST });
    initCron(app.prisma);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
