import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { AccountState, CliProvider } from '../../../application/ai/subscription-guard.js';
import type { Store } from '../../sqlite/store.js';
import { AiExecutionGateway } from './gateway.js';

/** Gateway wired to the store's accounts/evidence/consent. Run from the repository root (repo = cwd). */
export function gatewayFor(store: Store, override: { account?: (p: CliProvider) => { profile_id: string; runner_ref: string; state: AccountState } | undefined } = {}) {
  return new AiExecutionGateway({
    evidence: (p) => store.aiAccounts.latestEvidence(p), account: override.account ?? ((p) => store.aiAccounts.account(p)), consents: (p) => store.aiAccounts.consents(p),
    extraUsageConfirmedAt: (p) => store.aiAccounts.latestExtraUsageConfirmation(p), parentEnv: process.env, roots: { repo: resolve('.'), data: store.paths.root, sandboxRoot: join(tmpdir(), 'study-english-sandbox') }, now: store.now,
  });
}
