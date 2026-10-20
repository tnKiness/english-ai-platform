// P2 acceptance run: the synthetic package through QC1–QC4 with a REAL verified provider (QC4 blind solve →
// verification → assessment), then release and revoke with traceability. Uses a fresh temp data dir under
// var/qc-real/ so nothing synthetic enters the app's own data; D-01 evidence, consent and extra-usage records are
// read from the app store. Usage: npx tsx scripts/qc-real-synthetic.ts [--provider codex]
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { dataClassesFor, type CliProvider } from '../src/application/ai/subscription-guard.js';
import { AiExecutionGateway, GatewayAdapter } from '../src/infrastructure/ai/gateway/gateway.js';
import { runnerWorkspace } from '../src/infrastructure/ai/gateway/isolation.js';
import { dataPaths } from '../src/infrastructure/files/paths.js';
import { ConsoleQueries } from '../src/infrastructure/sqlite/console-queries.js';
import { builderPipeline, openStore } from '../src/infrastructure/sqlite/store.js';
import { processNextJob } from '../src/worker/worker.js';
import { ITEM_ID, REQUEST, SYNTHETIC_SOURCE, UNITS, coverage } from '../tests/fixtures/knowledge/synthetic.js';

const provider = (process.argv[process.argv.indexOf('--provider') + 1] ?? 'codex') as CliProvider;
const PKG = REQUEST.package_id;
const app = await openStore(dataPaths());
const dir = resolve('var', 'qc-real', new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(dir, { recursive: true });
const store = await openStore(dataPaths(dir));
const log = (label: string, value: unknown) => console.log(`${label}: ${typeof value === 'string' ? value : JSON.stringify(value)}`);

try {
  const gateway = new AiExecutionGateway({
    evidence: (p) => app.aiAccounts.latestEvidence(p), account: (p) => app.aiAccounts.account(p), consents: (p) => app.aiAccounts.consents(p),
    extraUsageConfirmedAt: (p) => app.aiAccounts.latestExtraUsageConfirmation(p), parentEnv: process.env,
    roots: { repo: resolve('.'), data: app.paths.root, sandboxRoot: runnerWorkspace() }, now: app.now,
  });
  const status = (await gateway.status()).find((s) => s.provider === provider);
  log('gateway', { provider, ready: status?.ready, error: status?.error, reasons: status?.reasons });
  if (!status?.ready) throw new Error(`${provider} is not READY`);
  const queries = new ConsoleQueries(store.db);
  const adapter = new GatewayAdapter(gateway, (job) => {
    const facts = queries.jobFacts(job.job_id);
    return { eligible: [provider], job: { billing_policy: job.billing_policy, required_capabilities: job.required_capabilities as ('text' | 'structured_result' | 'direct_audio')[],
      data_classes: facts ? dataClassesFor(facts) : ['learner_profile'] } };
  });
  const drain = async () => {
    for (let i = 0; i < 20; i++) {
      const out = await processNextJob({ queue: store.queue, adapter, loadContext: (id) => store.learning.loadManifestPayload(id), interpret: () => [],
        owner: 'qc-real', leaseMs: 10 * 60_000, heartbeatMs: 30_000, provider, claimOptions: { scopes: ['dry_run'] } });
      if (out.status === 'IDLE') return;
      log('  job', out);
    }
    throw new Error('worker did not go idle');
  };

  const pipeline = builderPipeline(store);
  pipeline.registerSource(SYNTHETIC_SOURCE);
  const req = pipeline.createRequest(REQUEST);
  for (const u of UNITS()) pipeline.stageUnit(req.request_id, u.kind, u.value);
  pipeline.setCoverage(req.request_id, coverage());
  const frozen = pipeline.freeze(req.request_id, 'v1');
  log('frozen', frozen);
  log('QC1-3 deterministic', pipeline.runChecks(PKG, 'v1').map((c) => ({ stage: c.stage, status: c.status, findings: c.findings.map((f) => f.code) })));
  // QC2/QC3 semantic review is a builder attestation on the exact hash (05 §5.C); here the content is our own synthetic fixture.
  pipeline.attest(PKG, 'v1', 'QC2', 'PASS', frozen.bundle_hash, 'Synthetic fixture: checked against its own author notes (coding AI, 20/10/2026)');
  pipeline.attest(PKG, 'v1', 'QC3', 'PASS', frozen.bundle_hash, 'Synthetic fixture: checked against 04 §2.B (coding AI, 20/10/2026)');
  pipeline.startQc4(PKG, 'v1');
  await drain();
  log('QC4 after blind solve/assessment', pipeline.advanceQc4(PKG, 'v1'));
  await drain();
  const qc4 = pipeline.advanceQc4(PKG, 'v1');
  log('QC4', qc4);
  for (const j of store.db.prepare(`SELECT j.job_id, j.task_type, j.state, r.provider, r.state AS run_state FROM ai_jobs j LEFT JOIN ai_runs r ON r.run_id = j.current_run_id`).all() as Record<string, unknown>[]) {
    log('  job', { ...j, result: store.queue.result(String(j.job_id)) });
  }
  log('stages', pipeline.qcStatus(PKG, 'v1').stages.map((s) => `${s.stage}:${s.status}`));
  const released = pipeline.release(PKG, 'v1', frozen.bundle_hash);
  log('release', released.allowed ? { allowed: true, qc: (released.manifest as { qc: unknown }).qc } : released);
  if (released.allowed) {
    const revoked = pipeline.revoke({ target_kind: 'item', target_id: ITEM_ID, target_version: 'v1' }, 'P2 acceptance: revoke after real-provider QC');
    log('revoke', { state: store.knowledge.releaseState(PKG, 'v1'), cache_invalidated: revoked.cache_invalidated, servable: store.knowledge.servableItem(ITEM_ID, 'v1', 'learner') });
  }
  log('data dir', join(dir));
} finally { store.close(); app.close(); }
