import { createServer } from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { prisma } from './db.js';
import { initRealtime } from './realtime/io.js';

const app = createApp();
const server = createServer(app);

// REST and WebSocket share one process and one HTTP server, so a trip room
// and the request that changed the trip are never out of sync.
initRealtime(server);

server.listen(config.PORT, () => {
  console.log(`SyncRoute API listening on http://localhost:${config.PORT}`);
  console.log(`  routing engine: ${config.OSRM_URL}`);
  console.log(`  websocket:      ws://localhost:${config.PORT}`);
});

async function shutdown(signal: string) {
  console.log(`\n${signal} received, shutting down`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
