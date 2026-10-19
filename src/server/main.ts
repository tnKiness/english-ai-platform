import { createApp } from './app.js';
const app = createApp();
await app.listen({ host: '127.0.0.1', port: 4317 });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close(); });
}
