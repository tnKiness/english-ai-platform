import { afterEach, expect, it } from 'vitest';
import { validateBenchmarkSuite, type BenchmarkSuiteManifest } from '../../src/domain/knowledge/benchmark-suite.js';
import { fixture, type Fixture } from './p1-helpers.js';
let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; });
const suite = (): BenchmarkSuiteManifest => ({ schema_version: '1', suite_id: 'synthetic-benchmark', version: '1', content_origin: 'synthetic_fixture', usage_rights: 'verified',
  sources: [{ source_id: 'synthetic', locator: 'self-authored fixture', rights_basis: 'Self-authored policy cases only', ai_processing_allowed: true }],
  skills: ['writing'], rubric_refs: [{ id: 'synthetic-rubric', version: '1', hash: 'a'.repeat(64) }],
  cases: ['typical_band', 'valid_exception_anti_template', 'low_signal_inconclusive', 'error_diagnosis'].map((category, i) => ({ case_id: `case${i}`,
    split: i === 3 ? 'dev' : 'holdout', category: category as BenchmarkSuiteManifest['cases'][number]['category'], skill: 'writing', expected_outcome: 'inconclusive',
    item_ref: { id: `synthetic${i}`, version: '1', hash: 'b'.repeat(64) } })) });

it('D05: missing evidence stays closed; synthetic manifest/report cannot enable a real backup', async () => {
  f = await fixture(); const repo = f.store.aiAccounts;
  const target = { cli_version: 'fixture-v1', model: 'synthetic' };
  expect(repo.canEnableBackupProvider('claude-code', target).allowed).toBe(false);
  const manifest = suite(); const ref = repo.registerBenchmarkSuite(manifest);
  expect(repo.registerBenchmarkSuite(manifest)).toEqual(ref);
  expect(() => repo.registerBenchmarkSuite({ ...manifest, skills: ['reading'] })).toThrow(/different/);
  repo.recordBenchmarkReport({ suite_id: ref.suite_id, suite_version: ref.version, suite_hash: ref.hash, provider: 'claude-code', ...target,
    content_origin: 'synthetic_fixture', holdout_cases_evaluated: 3, passed: true, findings: ['Synthetic plumbing only; no quality measurement'] });
  expect(repo.canEnableBackupProvider('claude-code', target)).toMatchObject({ allowed: false, scoring_quality_claimed: false, reasons: ['D05_SOURCED_BENCHMARK_REQUIRED'] });
  expect(repo.canEnableBackupProvider('claude-code', { ...target, require_sourced: false })).toMatchObject({ allowed: true, scoring_quality_claimed: false });
  expect(repo.canEnableBackupProvider('claude-code', { ...target, model: 'changed', require_sourced: false }).allowed).toBe(false);
  expect(repo.canEnableBackupProvider('agy', { ...target, require_sourced: false }).allowed).toBe(false);
  expect(() => f!.store.db.prepare('UPDATE benchmark_run_reports SET passed = 1').run()).toThrow(/immutable/);
  expect(() => repo.recordBenchmarkReport({ suite_id: ref.suite_id, suite_version: ref.version, suite_hash: ref.hash, provider: 'claude-code', ...target,
    content_origin: 'sourced', holdout_cases_evaluated: 3, passed: true, findings: [] })).toThrow(/origin/);
});

it('D05: source rights, holdout separation, completeness and schema fail closed', async () => {
  f = await fixture(); const repo = f.store.aiAccounts;
  const m = suite(); m.cases[3]!.item_ref = m.cases[0]!.item_ref;
  expect(validateBenchmarkSuite(m).errors).toContain('HOLDOUT_LEAKED_INTO_DEV:synthetic0');
  expect(() => repo.registerBenchmarkSuite({ ...suite(), usage_rights: 'unknown' })).toThrow(/RIGHTS/);
  expect(() => repo.registerBenchmarkSuite({ ...suite(), sources: [] })).toThrow(/schema/);
  expect(() => repo.registerBenchmarkSuite({ ...suite(), unexpected: true } as BenchmarkSuiteManifest)).toThrow(/schema/);
  const ref = repo.registerBenchmarkSuite(suite());
  repo.recordBenchmarkReport({ suite_id: ref.suite_id, suite_version: ref.version, suite_hash: ref.hash, provider: 'codex', cli_version: '1', model: 'synthetic',
    content_origin: 'synthetic_fixture', holdout_cases_evaluated: 1, passed: true, findings: [] });
  expect(repo.canEnableBackupProvider('codex', { cli_version: '1', model: 'synthetic', require_sourced: false }).reasons).toContain('BACKUP_PROVIDER_BENCHMARK_INCOMPLETE_HOLDOUT');
});
