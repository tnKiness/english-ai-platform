// Release gate (05 §5.B step 6, 06 §3 "Quy tắc nút Phát hành"). Pure: inputs are facts re-read at release time.
import type { Grant } from './coverage.js';
import type { ReleaseState } from './release-state.js';

export type QcStage = 'QC1' | 'QC2' | 'QC3' | 'QC4';
export type QcPart = 'deterministic' | 'semantic';
export type QcMethod = 'deterministic' | 'manual_attestation' | 'ai_semantic' | 'synthetic_fake';
export interface QcFact { stage: QcStage; part: QcPart; status: 'PASS' | 'FAIL' | 'NOT_RUN'; method: QcMethod; bundle_hash: string; qc_spec_version: string }

export interface GateInput {
  state: ReleaseState | undefined;
  approved_bundle_hash: string;
  frozen_bundle_hash: string;
  /** Recomputed from the JSON/media actually on disk now; null when a checksum failed. */
  recomputed_bundle_hash: string | null;
  integrity_errors: string[];
  qc_spec_version: string;
  required: { stage: QcStage; part: QcPart }[];
  qc: QcFact[];
  content_origin: 'synthetic_fixture' | 'sourced';
  source_blocks: string[];
  revoked: boolean;
  grants: Grant[];
}

/**
 * Release only what was QC'd: the approved hash, the frozen bundle and today's bytes must agree, and every
 * required QC part must have PASSed on that same bundle hash under the current QC spec. Editing anything after QC
 * changes the hash, so earlier results no longer count.
 */
export function releaseGate(g: GateInput): { allowed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (g.state !== 'draft') reasons.push(`STATE_${String(g.state ?? 'UNKNOWN').toUpperCase()}`);
  if (g.approved_bundle_hash !== g.frozen_bundle_hash) reasons.push('APPROVED_HASH_MISMATCH');
  if (g.integrity_errors.length > 0 || g.recomputed_bundle_hash === null) reasons.push('CONTENT_INTEGRITY_FAILED');
  else if (g.recomputed_bundle_hash !== g.frozen_bundle_hash) reasons.push('CONTENT_CHANGED_AFTER_QC');
  for (const r of g.required) {
    const fact = g.qc.find((q) => q.stage === r.stage && q.part === r.part);
    const label = `${r.stage}_${r.part.toUpperCase()}`;
    if (!fact) { reasons.push(`QC_MISSING_${label}`); continue; }
    if (fact.bundle_hash !== g.frozen_bundle_hash || fact.qc_spec_version !== g.qc_spec_version) { reasons.push(`QC_STALE_${label}`); continue; }
    if (fact.status !== 'PASS') reasons.push(`QC_${fact.status}_${label}`);
    if (fact.method === 'synthetic_fake' && g.content_origin !== 'synthetic_fixture') reasons.push(`QC_SYNTHETIC_ON_SOURCED_${label}`);
  }
  // Already prefixed SOURCE_* by sourceUseDecision, suffixed with the source id.
  reasons.push(...g.source_blocks);
  if (g.revoked) reasons.push('REVOKED');
  if (!g.grants.some((x) => x.granted)) reasons.push('NO_USAGE_ROLE_GRANTED');
  return { allowed: reasons.length === 0, reasons };
}
