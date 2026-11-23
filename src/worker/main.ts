// Worker entrypoint (06 §5.B.3: one worker, one AI job at a time). P2 rules:
// - Real providers run only through the gateway after subscriptionGuard passes (none is verified yet: D-01).
// - When the gateway blocks every provider, the worker refuses to start unless --fake is given; then it runs
//   FakeAdapter on dry-run jobs only, so synthetic output can never become learner evidence.
// - Learner-scope jobs are processed only with --complaints (re-evaluations) or --learning (P5-5: Writing assessments
//   submitted with STUDY_ENGLISH_LEARNING_AI=real), always through the gateway, never by FakeAdapter.
import { dataClassesFor, type CliProvider } from '../application/ai/subscription-guard.js';
import { ComplaintService } from '../application/learning/complaints.js';
import { LearningWorkflowService } from '../application/learning/writing-workflow.js';
import { FrameworkAuthoringService } from '../application/authoring/framework-authoring.js';
import { ItemAuthoringService } from '../application/authoring/item-authoring.js';
import { LearnerItemService } from '../application/authoring/learner-items.js';
import { resolve } from 'node:path';
import { FRAMEWORK_POLICY_FILES, ITEM_POLICY_FILES, loadFrameworkPolicy, loadItemPolicy } from '../infrastructure/authoring/framework-sources.js';
import { gatewayAuthoringExecutor } from '../infrastructure/authoring/gateway-executor.js';
import { FakeAdapter } from '../infrastructure/ai/fake-adapter.js';
import { gatewayFor } from '../infrastructure/ai/gateway/compose.js';
import { GatewayAdapter } from '../infrastructure/ai/gateway/gateway.js';
import { dataPaths } from '../infrastructure/files/paths.js';
import { ConsoleQueries } from '../infrastructure/sqlite/console-queries.js';
import { builderPipeline, openStore } from '../infrastructure/sqlite/store.js';
import { DEFAULT_QUOTA_RECHECK_MS, quotaWaitable, runWorkerLoop, waitForProvider, type WorkerDeps } from './worker.js';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const store = await openStore(dataPaths());
const controller = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => controller.abort());
try {
  const gateway = gatewayFor(store);
  let status = await gateway.status();
  // E-31: every provider out of quota (and nothing else wrong): wait for the earliest reopening instead of exiting.
  if (!flag('--fake') && !flag('--once') && quotaWaitable(status)) {
    const intervalMs = Number(option('--quota-recheck-ms') ?? DEFAULT_QUOTA_RECHECK_MS);
    let announced = false;
    status = await waitForProvider(() => gateway.status(), { intervalMs, signal: controller.signal, onWait: (s) => {
      if (announced) return;
      announced = true;
      console.log(`Mọi provider đang hết hạn mức (${s.map((x) => `${x.provider}: ${x.reasons.join(', ') || x.error}`).join('; ')}). Worker chờ và kiểm lại mỗi ${Math.round(intervalMs / 60_000)} phút; Ctrl+C để dừng.`);
    } }) ?? await gateway.status();
    if (controller.signal.aborted) throw new Error('GATEWAY_BLOCKED');
    if (status.some((s) => s.ready)) console.log('Đã có provider mở lại hạn mức; worker bắt đầu xử lý.');
  }
  const ready = status.filter((s) => s.ready).map((s) => s.provider);
  const base = { queue: store.queue, loadContext: (id: string) => store.learning.loadManifestPayload(id), interpret: () => [], owner: `worker-${process.pid}`,
    leaseMs: 5 * 60_000, heartbeatMs: 30_000, claimOptions: { scopes: ['dry_run' as const] } };
  let deps: WorkerDeps;
  if (ready.length === 0) {
    for (const s of status) console.log(`AI thật bị chặn — ${s.provider}: ${s.error} (${s.reasons.join(', ')})`);
    if (!flag('--fake') || flag('--learning')) {
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
    console.log(`Provider đã xác minh: ${provider}.${flag('--learning') || flag('--complaints') ? '' : ' Chỉ xử lý job dry-run (thêm --learning để chấm bài của bạn).'}`);
    deps = { ...base, provider, adapter: new GatewayAdapter(gateway, (job) => {
      const facts = queries.jobFacts(job.job_id);
      return { eligible: store.queue.get(job.job_id)?.eligible_providers ?? [provider], job: { billing_policy: job.billing_policy, required_capabilities: job.required_capabilities as ('text' | 'structured_result' | 'direct_audio')[],
        data_classes: facts ? dataClassesFor(facts) : ['learner_profile'] } };
    }) };
    if (flag('--complaints') && flag('--learning')) throw Object.assign(new Error('Chọn một trong --complaints hoặc --learning'), {});
    if (flag('--complaints')) {
      const complaints = new ComplaintService(store);
      deps.claimOptions = { scopes: ['learner'], complaintsOnly: true };
      deps.interpret = (result, claim) => complaints.interpret(result, claim);
    }
    if (flag('--learning')) {
      // P5-5: Writing assessments of the learner (not complaint re-evaluations). The workspace finalises the diagnosis.
      const learning = new LearningWorkflowService(store);
      deps.claimOptions = { scopes: ['learner'], excludeComplaints: true };
      deps.interpret = (result, claim) => learning.interpretJob(result, claim.job.job_id);
      console.log('Chế độ --learning: chấm bài Writing của người học bằng provider đã xác minh.');
    }
  }
  if (flag('--once')) {
    const { processNextJob } = await import('./worker.js');
    console.log(JSON.stringify(await processNextJob(deps)));
  } else {
    // E-50 (C5, N8): --replenish keeps the AI prompt bank above the N8 thresholds, only while the queue is idle,
    // at most once per --replenish-every-min (default 30) and within the daily cap of item authoring calls.
    const idleTasks: (() => Promise<void>)[] = [];
    if (flag('--learning') && ready.length > 0) {
      // E-51 (C4): review prompts the learner imported, while idle, with the learner_owned_content consent class.
      const frameworks = new FrameworkAuthoringService(store, loadFrameworkPolicy(), () => ({ sources: [], haystacks: [], missing: [] }));
      const own = new LearnerItemService(store, builderPipeline(store), () => frameworks.approved(), loadItemPolicy());
      const ownExecutor = gatewayAuthoringExecutor(store, undefined, ['learner_owned_content']);
      let nextOwn = 0;
      idleTasks.push(async () => {
        if (Date.now() < nextOwn) return;
        nextOwn = Date.now() + 2 * 60_000;
        try {
          const r = await own.reviewPending(ownExecutor);
          if (r.run_id) console.log(`Rà soát đề bạn nhập (C4): ${r.reviewed} đề, vào kho ${r.released}.`);
        } catch (e) { console.log(`Rà soát đề bạn nhập (C4) chưa chạy: ${e instanceof Error ? e.message : String(e)}`); }
      });
    }
    if (flag('--replenish')) {
      if (!flag('--learning') || ready.length === 0) throw new Error('--replenish cần --learning và một provider đã xác minh');
      // E-52: one item bank per skill (Writing Task 2, Speaking text), each with its approved framework.
      const banks = Object.entries(ITEM_POLICY_FILES).map(([skill, file]) => {
        const fw = new FrameworkAuthoringService(store, loadFrameworkPolicy(resolve(FRAMEWORK_POLICY_FILES[skill]!)), () => ({ sources: [], haystacks: [], missing: [] }));
        return { skill, items: new ItemAuthoringService(store, builderPipeline(store), () => fw.approved(), loadItemPolicy(resolve(file))) };
      });
      const executor = gatewayAuthoringExecutor(store);
      const everyMs = Number(option('--replenish-every-min') ?? 30) * 60_000;
      let next = 0;
      idleTasks.push(async () => {
        if (Date.now() < next) return;
        next = Date.now() + everyMs;
        for (const b of banks) {
          const r = await b.items.replenish(executor);
          if (r.ran.length || (r.skipped.length && !r.skipped.includes('FRAMEWORK_NOT_APPROVED'))) {
            console.log(`Bổ sung kho đề ${b.skill} (C5): ${r.ran.map((x) => `${x.task_scope} lô ${x.batch_id.slice(0, 8)} phát hành ${x.released}`).join('; ') || 'không chạy'}${r.skipped.length ? ` · bỏ qua: ${r.skipped.join(', ')}` : ''}`);
          }
        }
      });
      console.log('Chế độ --replenish: tự bổ sung kho đề khi worker rảnh (N8).');
    }
    await runWorkerLoop({ ...deps, pollMs: Number(option('--poll-ms') ?? 2000), quotaRecheckMs: option('--quota-recheck-ms') ? Number(option('--quota-recheck-ms')) : undefined, signal: controller.signal, onIdle: idleTasks.length ? async () => { for (const t of idleTasks) await t(); } : undefined });
  }
} catch (error) {
  if (!(error instanceof Error && error.message === 'GATEWAY_BLOCKED')) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
} finally { store.close(); }
