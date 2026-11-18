import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { scheduleAutoBackup } from '../infrastructure/backup/auto.js';
import { dataPaths } from '../infrastructure/files/paths.js';
import { openStore } from '../infrastructure/sqlite/store.js';
import { createApp, DEFAULT_PORT } from './app.js';

// Run from the repository root (migrations/ and contracts/ are resolved relative to it). Data lives in var/, or in
// STUDY_ENGLISH_DATA_DIR (a separate folder for trying things without touching your real data). Port: STUDY_ENGLISH_PORT
// (default 4317), e.g. to run a trial copy next to the real one.
// When dist/web exists (npm run build), the UI is served on the same address: http://127.0.0.1:4317.
const store = await openStore(dataPaths(process.env.STUDY_ENGLISH_DATA_DIR || undefined));
const webRoot = resolve('dist', 'web');
const serveWeb = existsSync(resolve(webRoot, 'index.html')) && process.env.STUDY_ENGLISH_SERVE_WEB !== '0';
const port = Number(process.env.STUDY_ENGLISH_PORT || DEFAULT_PORT);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('STUDY_ENGLISH_PORT must be an integer 1024–65535');
const app = createApp({ store, webRoot: serveWeb ? webRoot : undefined, port });
await app.listen({ host: '127.0.0.1', port });
console.log(`Study English: ${serveWeb ? `http://127.0.0.1:${port} (giao diện + API)` : `API ở http://127.0.0.1:${port} (giao diện: npm run dev)`} · dữ liệu: ${store.paths.root}`);
// E-32: daily backup + weekly restore drill while the app runs (STUDY_ENGLISH_AUTO_BACKUP=0 turns it off).
const stopAutoBackup = process.env.STUDY_ENGLISH_AUTO_BACKUP === '0' ? () => undefined : scheduleAutoBackup(store);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { stopAutoBackup(); void app.close().finally(() => store.close()); });
}
