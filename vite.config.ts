import { defineConfig } from 'vite';
export default defineConfig({
  root: 'src/web',
  server: { host: '127.0.0.1', port: 5173, strictPort: true,
    // Only API calls: a bare '/api' prefix would also capture the web module /api.ts.
    proxy: { '^/api/': { target: 'http://127.0.0.1:4317', changeOrigin: true } } },
  build: { outDir: '../../dist/web', emptyOutDir: false },
});
