import { dataPaths } from '../infrastructure/files/paths.js';
import { openStore } from '../infrastructure/sqlite/store.js';
import { createApp } from './app.js';

// Run from the repository root (migrations/ and contracts/ are resolved relative to it). Data lives in var/.
const store = await openStore(dataPaths());
const app = createApp({ store });
await app.listen({ host: '127.0.0.1', port: 4317 });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { void app.close().finally(() => store.close()); });
}
