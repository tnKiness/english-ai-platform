// `npm run relay:console` — start the Relay Console on http://127.0.0.1:4319 (RELAY_CONSOLE_PORT to change).
import { createConsole } from './server.js';

const app = createConsole({ port: Number(process.env.RELAY_CONSOLE_PORT ?? 4319) });
const port = await app.listen();
console.log(`Relay Console: http://127.0.0.1:${port}/`);
console.log('Chỉ mở trên máy này. Ctrl+C để tắt (lượt chat đang chạy sẽ bị dừng).');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
