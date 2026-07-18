import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';

const app = createApp();
const server = createServer(app);

server.listen(config.PORT, () => {
  console.log(`SyncRoute API listening on http://localhost:${config.PORT}`);
  console.log(`  routing engine: ${config.OSRM_URL}`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
