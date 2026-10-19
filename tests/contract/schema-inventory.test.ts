import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validateContract } from '../../src/infrastructure/contracts/validate.js';
const fixtures: Record<string, Record<string, unknown>> = JSON.parse(readFileSync('tests/fixtures/contracts.json', 'utf8'));
const schema = JSON.parse(readFileSync('contracts/core.v1.schema.json', 'utf8'));
it('covers every contract with a synthetic fixture', () => {
  expect(Object.keys(fixtures).sort()).toEqual(Object.keys(schema.$defs).sort());
});
it.each(Object.entries(fixtures))('%s accepts its fixture and rejects incomplete/extra fields', (name, fixture) => {
  expect(validateContract(name, fixture)).toBe(true);
  expect(validateContract(name, {})).toBe(false);
  expect(validateContract(name, { ...fixture, unexpected_secret: 'synthetic' })).toBe(false);
});
it('does not turn broken measurements into positive or negative evidence', () => {
  for (const outcome of ['met', 'not_met']) {
    expect(validateContract('observation', { ...fixtures.observation, outcome })).toBe(false);
  }
});
it('separates original submissions from repair revisions', () => {
  expect(validateContract('submission', { ...fixtures.submission, kind: 'repair' })).toBe(false);
  expect(validateContract('submission', { ...fixtures.submission, kind: 'repair', revision: 1, repair_attempt_index: 1, parent_submission_id: 's' })).toBe(true);
});
it('rejects mismatched job phase and non-UTC timestamps', () => {
  expect(validateContract('job', { ...fixtures.job, phase: 'blind_solve' })).toBe(false);
  expect(validateContract('attempt', { ...fixtures.attempt, created_at: '2026-10-19T07:00:00+07:00' })).toBe(false);
});
