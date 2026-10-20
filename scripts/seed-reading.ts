// Explicit local synthetic demo. No real adapter, credentials or provider inspection.
import { FakeAdapter } from '../src/infrastructure/ai/fake-adapter.js';
import { dataPaths } from '../src/infrastructure/files/paths.js';
import { builderPipeline, openStore } from '../src/infrastructure/sqlite/store.js';
import { processNextJob } from '../src/worker/worker.js';
import { readingUnits } from '../tests/fixtures/knowledge/reading-p3.js';
import { coverage, REQUEST, SYNTHETIC_SOURCE } from '../tests/fixtures/knowledge/synthetic.js';

const store = await openStore(dataPaths());
try {
  const pipeline = builderPipeline(store);
  const version = 'p3-demo-1';
  const pkg = 'syn-reading-p3-demo';
  if (store.builder.bundle(pkg, version)) throw new Error('Demo already exists. Its release/revocation is preserved; no automatic overwrite.');
  pipeline.registerSource(SYNTHETIC_SOURCE);
  const req = pipeline.createRequest({ ...REQUEST, request_id: 'req-reading-p3-demo', package_id: pkg });
  for (const u of readingUnits(version)) pipeline.stageUnit(req.request_id, u.kind, u.value);
  pipeline.setCoverage(req.request_id, coverage(version));
  const frozen = pipeline.freeze(req.request_id, version);
  pipeline.runChecks(pkg, version);
  for (const stage of ['QC2', 'QC3'] as const) pipeline.attest(pkg, version, stage, 'PASS', frozen.bundle_hash,
    'Project-authored synthetic fixture: paper contradicts glass; membership size absent; spring and in spring both valid. No Band or diagnostic claims.');
  const adapter = new FakeAdapter('success', { blindAnswers: { q1: 'FALSE', q2: 'NOT GIVEN', q3: 'spring' } });
  pipeline.startQc4(pkg, version);
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 10; i++) {
      const out = await processNextJob({ queue: store.queue, adapter, loadContext: (id) => store.learning.loadManifestPayload(id), interpret: () => [],
        owner: 'p3-reading-seed', leaseMs: 60_000, heartbeatMs: 10_000, provider: 'fake', claimOptions: { scopes: ['dry_run'] } });
      if (out.status === 'IDLE') break;
    }
    pipeline.advanceQc4(pkg, version);
  }
  const released = pipeline.release(pkg, version, frozen.bundle_hash);
  if (!released.allowed) throw new Error(`Demo release blocked: ${released.reasons.join(', ')}`);
  console.log('Synthetic Reading demo released through QC1–4 (FakeAdapter). No Band calibration.');
} finally { store.close(); }
