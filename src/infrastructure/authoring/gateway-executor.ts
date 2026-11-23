// E-42: the real AuthoringExecutor. Same path as every real AI call: the gateway selects a provider that passes the
// subscription guard (D-01 evidence, billing, consent for the data classes sent), in the E-38 preference order; a
// fallback provider additionally needs its D-05 benchmark. Content authoring sends knowledge_content only (approved
// sources, no learner data). No paid API fallback exists: when every provider is blocked, the call fails.
import { randomUUID } from 'node:crypto';
import type { Job } from '../../application/ai/provider-adapter.js';
import { CLI_PROVIDERS, type DataClass } from '../../application/ai/subscription-guard.js';
import type { AuthoringExecutor } from '../../application/authoring/framework-authoring.js';
import type { AssessExecutor } from '../../application/authoring/calibration.js';
import { gatewayFor } from '../ai/gateway/compose.js';
import { GatewayAdapter } from '../ai/gateway/gateway.js';
import type { Store } from '../sqlite/store.js';

export function gatewayAuthoringExecutor(store: Store, limits = { timeoutMs: 900_000, maxOutputBytes: 2_000_000 }, dataClasses: DataClass[] = ['knowledge_content']): AuthoringExecutor {
  const gateway = gatewayFor(store, { limits });
  const adapter = new GatewayAdapter(gateway, () => ({ eligible: [...CLI_PROVIDERS],
    job: { billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], data_classes: dataClasses } }));
  return async (task, payload) => {
    const runId = randomUUID();
    const job: Job = { job_id: randomUUID(), context_manifest_id: randomUUID(), billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], task_type: task };
    const raw = await adapter.execute(runId, job, { manifest_id: job.context_manifest_id, payload });
    const result = adapter.normalizeResult(raw, task);
    const chosen = adapter.chosenProvider(runId);
    const blocked = typeof raw === 'object' && raw !== null && 'blocked' in raw ? (raw as { blocked: string[] }).blocked.join(', ') : undefined;
    const invalid = !result.ok && 'detail' in result && typeof result.detail === 'string' ? result.detail.slice(0, 600) : undefined;
    return { result, provider: chosen?.provider ?? 'none', cli_version: chosen?.cli_version ?? null, model: chosen?.model ?? null, detail: blocked ?? invalid };
  };
}

/** E-55 (C6): one Writing assessment of an official sample (public material: knowledge_content only). */
export function gatewayAssessExecutor(store: Store): AssessExecutor {
  const gateway = gatewayFor(store, { limits: { timeoutMs: 300_000, maxOutputBytes: 1_000_000 } });
  const adapter = new GatewayAdapter(gateway, () => ({ eligible: [...CLI_PROVIDERS],
    job: { billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], data_classes: ['knowledge_content'] } }));
  return async (payload) => {
    const runId = randomUUID();
    const job: Job = { job_id: randomUUID(), context_manifest_id: randomUUID(), billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], task_type: 'writing.assess' };
    const raw = await adapter.execute(runId, job, { manifest_id: job.context_manifest_id, payload });
    const result = adapter.normalizeResult(raw, 'writing.assess');
    const chosen = adapter.chosenProvider(runId);
    const detail = !result.ok && 'detail' in result && typeof result.detail === 'string' ? result.detail.slice(0, 600) : undefined;
    return { result, provider: chosen?.provider ?? 'none', cli_version: chosen?.cli_version ?? null, model: chosen?.model ?? null, ...(detail ? { detail } : {}) };
  };
}

