import { defineConfig } from 'vite';
export default defineConfig({
  root: 'src/web',
  server: { host: '127.0.0.1', port: 5173, strictPort: true,
    proxy: { '/api': { target: 'http://127.0.0.1:4317', changeOrigin: true } } },
  build: { outDir: '../../dist/web', emptyOutDir: false },
});
