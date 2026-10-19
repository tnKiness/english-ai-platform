import { expect, it } from 'vitest';
import { createApp } from '../../src/server/app.js';
it('exposes health only to local hosts and expected origins', async () => {
  const app = createApp();
  try {
    expect((await app.inject({ url: '/api/health', headers: { host: '127.0.0.1:4317' } })).json()).toEqual({ status: 'ok', stage: 'P0', real_ai_enabled: false });
    expect((await app.inject({ url: '/api/health', headers: { host: 'evil.example' } })).statusCode).toBe(403);
    expect((await app.inject({ url: '/api/health', headers: { host: '127.0.0.1:4317', origin: 'https://evil.example' } })).statusCode).toBe(403);
  } finally { await app.close(); }
});
