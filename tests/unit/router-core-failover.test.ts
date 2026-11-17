// E-24: lõi định tuyến đồng bộ từ ai-router và cầu nối của nó vào gateway thuê bao.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyRunFailure, cooldownUntil, streamFacts } from '../../src/infrastructure/ai/gateway/failover.js';
import { parseEnvelope, type EnvelopeSpec } from '../../src/infrastructure/ai/gateway/envelope.js';

const NOW = new Date('2026-11-17T08:00:00.000Z');
const lines = (...events: object[]) => events.map((e) => JSON.stringify(e)).join('\n');

describe('classifyRunFailure (ai-router core)', () => {
  it('Claude rate_limit_event rejected → QUOTA_EXHAUSTED with the stated reset', () => {
    const resetsAt = Math.floor(NOW.getTime() / 1000) + 3600;
    const stdout = lines({ type: 'system', subtype: 'init', tools: [], mcp_servers: [] },
      { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt, rateLimitType: 'five_hour' } },
      { type: 'result', is_error: true, subtype: 'error', result: '' });
    expect(classifyRunFailure({ stdout, exitCode: 1 }, NOW)).toEqual({ error: 'QUOTA_EXHAUSTED', reset_at: new Date(resetsAt * 1000).toISOString() });
  });

  it('Codex turn.failed with the observed usage-limit text → QUOTA_EXHAUSTED with a reset later today', () => {
    const stdout = lines({ type: 'thread.started', thread_id: 't' }, { type: 'turn.failed', error: { message: 'You’ve hit your usage limit. Upgrade to Pro or try again at 11:59 PM.' } });
    const r = classifyRunFailure({ stdout, exitCode: 1 }, NOW);
    expect(r?.error).toBe('QUOTA_EXHAUSTED');
    expect(r?.reset_at && new Date(r.reset_at) > NOW).toBe(true);
  });

  it('agy non-SUCCESS result → classified by its error text', () => {
    const stdout = lines({ event: 'result', result: { status: 'ERROR', error: 'RESOURCE_EXHAUSTED: quota exceeded' } });
    expect(classifyRunFailure({ stdout, exitCode: 1 }, NOW)?.error).toBe('QUOTA_EXHAUSTED');
    expect(classifyRunFailure({ stdout: lines({ event: 'error', error: { message: '503 Service Unavailable' } }), exitCode: 1 }, NOW)?.error).toBe('NETWORK');
    expect(classifyRunFailure({ stdout: lines({ type: 'error', message: 'Not logged in. Please log in.' }), exitCode: 1 }, NOW)?.error).toBe('AUTH_EXPIRED');
  });

  it('never reads the model answer: a learner text about "usage limit" in a successful result is not a failure', () => {
    const stdout = lines({ type: 'result', is_error: false, result: '{"essay":"I hit your usage limit, rate limit 429"}' });
    expect(classifyRunFailure({ stdout, exitCode: 0 }, NOW)).toBeNull();
    expect(classifyRunFailure({ stdout, stderr: 'warning: retrying after 429 rate limit', exitCode: 0 }, NOW)).toBeNull();
  });

  it('unknown failures stay unclassified (caller keeps BILLING_UNVERIFIED)', () => {
    expect(classifyRunFailure({ stdout: 'boom', stderr: 'segfault', exitCode: 3 }, NOW)).toBeNull();
  });

  it('an implausible reset time is dropped; the default cooldown applies', () => {
    const resetsAt = Math.floor(NOW.getTime() / 1000) + 30 * 86_400;
    const stdout = lines({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt } });
    expect(classifyRunFailure({ stdout, exitCode: 1 }, NOW)).toEqual({ error: 'QUOTA_EXHAUSTED', reset_at: null });
  });

  it('streamFacts keeps a near-limit warning across later events', () => {
    const f = streamFacts(lines({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed_warning' } }, { type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } }));
    expect(f.quota).toMatchObject({ rejected: false, warning: true });
  });
});

describe('cooldownUntil', () => {
  it('uses the stated reset when it is ahead, else the core defaults (60 min quota, 5 min rate limit)', () => {
    const later = new Date(NOW.getTime() + 2 * 3_600_000).toISOString();
    expect(cooldownUntil('QUOTA_EXHAUSTED', later, NOW).toISOString()).toBe(later);
    expect(cooldownUntil('QUOTA_EXHAUSTED', null, NOW).getTime() - NOW.getTime()).toBe(60 * 60_000);
    expect(cooldownUntil('RATE_LIMIT', null, NOW).getTime() - NOW.getTime()).toBe(5 * 60_000);
    expect(cooldownUntil('QUOTA_EXHAUSTED', new Date(NOW.getTime() - 1000).toISOString(), NOW).getTime() - NOW.getTime()).toBe(60 * 60_000);
  });
});

describe('parseEnvelope with the routing core', () => {
  const spec: EnvelopeSpec = { status: 'VERIFIED', source: 'synthetic', format: 'jsonl_last_object', result_path: ['result'], error_flag_path: ['is_error'],
    error_patterns: [{ pattern: 'refused by policy', error: 'REFUSAL' }] };

  it('recorded D-01 patterns still win', () => {
    const r = parseEnvelope(lines({ type: 'result', is_error: true, result: 'refused by policy, rate limit' }), 1, spec, 'writing.assess', { now: NOW });
    expect(r).toMatchObject({ ok: false, error: 'REFUSAL' });
  });

  it('a quota error without a recorded pattern now fails over instead of stopping as BILLING_UNVERIFIED', () => {
    const resetsAt = Math.floor(NOW.getTime() / 1000) + 600;
    const stdout = lines({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt } }, { type: 'result', is_error: true, result: '' });
    expect(parseEnvelope(stdout, 1, spec, 'writing.assess', { now: NOW })).toMatchObject({ ok: false, error: 'QUOTA_EXHAUSTED', reset_at: new Date(resetsAt * 1000).toISOString() });
  });

  it('an unrecognised error and an unverified layout still stop closed', () => {
    expect(parseEnvelope(lines({ type: 'result', is_error: true, result: 'weird' }), 1, spec, 'writing.assess', { now: NOW })).toMatchObject({ ok: false, error: 'BILLING_UNVERIFIED' });
    expect(parseEnvelope('Not logged in', 1, { ...spec, status: 'NEEDS_VERIFICATION' }, 'writing.assess', { now: NOW })).toMatchObject({ ok: false, error: 'BILLING_UNVERIFIED' });
  });
});

it('router-core is an untouched copy of the recorded ai-router files (edit in ai-router, then npm run router:sync)', () => {
  const dir = resolve('src/infrastructure/ai/router-core');
  const source = JSON.parse(readFileSync(join(dir, 'SOURCE.json'), 'utf8')) as { files: Record<string, string> };
  expect(Object.keys(source.files).sort()).toEqual(['outcome.ts', 'routing.ts', 'types.ts']);
  for (const [name, hash] of Object.entries(source.files)) {
    const text = readFileSync(join(dir, name), 'utf8').replace(/\r\n/g, '\n');
    expect(createHash('sha256').update(text, 'utf8').digest('hex'), name).toBe(hash);
  }
});
