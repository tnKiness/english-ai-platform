// `npm run relay:console` — start the Relay Console on http://127.0.0.1:4319 (RELAY_CONSOLE_PORT to change).
import { createConsole } from './server.js';

const wanted = Number(process.env.RELAY_CONSOLE_PORT ?? 4319);
const app = createConsole({ port: wanted });
app.server.once('error', (error: NodeJS.ErrnoException) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Cổng ${wanted} đang được dùng — có thể Relay Console khác vẫn mở. Dùng trang đó, tắt nó, hoặc đặt RELAY_CONSOLE_PORT khác.`
    : `Không mở được console: ${error.message}`);
  process.exit(1);
});
const port = await app.listen();
console.log(`Relay Console: http://127.0.0.1:${port}/`);
console.log('Chỉ mở trên máy này. Ctrl+C để tắt (lượt chat đang chạy sẽ bị dừng).');
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { void app.close().then(() => process.exit(0)); });
