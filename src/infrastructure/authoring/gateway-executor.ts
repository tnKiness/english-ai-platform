// E-42: the real AuthoringExecutor. Same path as every real AI call: the gateway selects a provider that passes the
// subscription guard (D-01 evidence, billing, consent for the data classes sent), in the E-38 preference order; a
// fallback provider additionally needs its D-05 benchmark. Content authoring sends knowledge_content only (approved
// sources, no learner data). No paid API fallback exists: when every provider is blocked, the call fails.
import { randomUUID } from 'node:crypto';
import type { Job } from '../../application/ai/provider-adapter.js';
import { CLI_PROVIDERS } from '../../application/ai/subscription-guard.js';
import type { AuthoringExecutor } from '../../application/authoring/framework-authoring.js';
import { gatewayFor } from '../ai/gateway/compose.js';
import { GatewayAdapter } from '../ai/gateway/gateway.js';
import type { Store } from '../sqlite/store.js';

export function gatewayAuthoringExecutor(store: Store, limits = { timeoutMs: 900_000, maxOutputBytes: 2_000_000 }): AuthoringExecutor {
  const gateway = gatewayFor(store, { limits });
  const adapter = new GatewayAdapter(gateway, () => ({ eligible: [...CLI_PROVIDERS],
    job: { billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], data_classes: ['knowledge_content'] } }));
  return async (task, payload) => {
    const runId = randomUUID();
    const job: Job = { job_id: randomUUID(), context_manifest_id: randomUUID(), billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], task_type: task };
    const raw = await adapter.execute(runId, job, { manifest_id: job.context_manifest_id, payload });
    const result = adapter.normalizeResult(raw, task);
    const chosen = adapter.chosenProvider(runId);
    const blocked = typeof raw === 'object' && raw !== null && 'blocked' in raw ? (raw as { blocked: string[] }).blocked.join(', ') : undefined;
    return { result, provider: chosen?.provider ?? 'none', cli_version: chosen?.cli_version ?? null, model: chosen?.model ?? null, detail: blocked };
  };
}
