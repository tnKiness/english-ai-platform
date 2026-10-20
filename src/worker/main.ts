// Worker entrypoint (06 §5.B.3: one worker, one AI job at a time). P2 rules:
// - Real providers run only through the gateway after subscriptionGuard passes (none is verified yet: D-01).
// - When the gateway blocks every provider, the worker refuses to start unless --fake is given; then it runs
//   FakeAdapter on dry-run jobs only, so synthetic output can never become learner evidence.
// - Learner-scope jobs stay queued in P2 (learning flows are P3).
import { dataClassesFor, type CliProvider } from '../application/ai/subscription-guard.js';
import { FakeAdapter } from '../infrastructure/ai/fake-adapter.js';
import { gatewayFor } from '../infrastructure/ai/gateway/compose.js';
import { GatewayAdapter } from '../infrastructure/ai/gateway/gateway.js';
import { dataPaths } from '../infrastructure/files/paths.js';
import { ConsoleQueries } from '../infrastructure/sqlite/console-queries.js';
import { openStore } from '../infrastructure/sqlite/store.js';
import { runWorkerLoop, type WorkerDeps } from './worker.js';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const store = await openStore(dataPaths());
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => controller.abort());
try {
  const gateway = gatewayFor(store);
  const status = await gateway.status();
  const ready = status.filter((s) => s.ready).map((s) => s.provider);
  const base = { queue: store.queue, loadContext: (id: string) => store.learning.loadManifestPayload(id), interpret: () => [], owner: `worker-${process.pid}`,
    leaseMs: 5 * 60_000, heartbeatMs: 30_000, claimOptions: { scopes: ['dry_run' as const] } };
  let deps: WorkerDeps;
  if (ready.length === 0) {
    for (const s of status) console.log(`AI thật bị chặn — ${s.provider}: ${s.error} (${s.reasons.join(', ')})`);
    if (!flag('--fake')) {
      console.log('Không chạy. Thêm --fake để xử lý job dry-run bằng FakeAdapter (kết quả synthetic, không phải bằng chứng học).');
      process.exitCode = 3;
      throw new Error('GATEWAY_BLOCKED');
    }
    // Scripted blind answers for synthetic demos, e.g. --fake-blind-answers "q1=FALSE,q2=NOT GIVEN".
    const blindAnswers = Object.fromEntries((option('--fake-blind-answers') ?? '').split(',').filter(Boolean).map((p) => p.split('=').map((s) => s.trim()) as [string, string]));
    console.log('Chế độ FakeAdapter: chỉ job dry-run; provider ghi "fake".');
    deps = { ...base, adapter: new FakeAdapter('success', { blindAnswers }), provider: 'fake' };
  } else {
    const provider = ready[0] as CliProvider;
    const queries = new ConsoleQueries(store.db);
    console.log(`Provider đã xác minh: ${provider}. P2 chỉ xử lý job dry-run.`);
    deps = { ...base, provider, adapter: new GatewayAdapter(gateway, (job) => {
      const facts = queries.jobFacts(job.job_id);
      return { eligible: [provider], job: { billing_policy: job.billing_policy, required_capabilities: job.required_capabilities as ('text' | 'structured_result' | 'direct_audio')[],
        data_classes: facts ? dataClassesFor(facts) : ['learner_profile'] } };
    }) };
  }
  if (flag('--once')) {
    const { processNextJob } = await import('./worker.js');
    console.log(JSON.stringify(await processNextJob(deps)));
  } else {
    await runWorkerLoop({ ...deps, pollMs: Number(option('--poll-ms') ?? 2000), signal: controller.signal });
  }
} catch (error) {
  if (!(error instanceof Error && error.message === 'GATEWAY_BLOCKED')) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
} finally { store.close(); }
