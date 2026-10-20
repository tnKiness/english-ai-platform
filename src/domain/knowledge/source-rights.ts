// Source Registry rules (05 §2.D, D-05). Code applies the rights already recorded; it never infers legal rights.
export interface SourceRights { status: 'determined' | 'unclear'; store_copy: boolean; ai_processing: boolean; learner_display: boolean }
export interface SourceFacts { source_id: string; version: string; registry_state: 'candidate' | 'approved' | 'rejected'; rights: SourceRights }
export interface IntendedUse { store_copy: boolean; ai_processing: boolean; learner_display: boolean }

export type SourceBlock = 'SOURCE_UNREGISTERED' | 'SOURCE_RIGHTS_UNCLEAR' | 'SOURCE_USE_NOT_PERMITTED';

/** A source may feed a release only when approved, rights determined, and every intended use explicitly allowed. */
export function sourceUseDecision(source: SourceFacts | undefined, use: IntendedUse): { allowed: boolean; blocks: SourceBlock[]; detail: string[] } {
  if (!source) return { allowed: false, blocks: ['SOURCE_UNREGISTERED'], detail: ['not in registry'] };
  const blocks: SourceBlock[] = [];
  const detail: string[] = [];
  if (source.registry_state !== 'approved') { blocks.push('SOURCE_UNREGISTERED'); detail.push(`registry_state=${source.registry_state}`); }
  if (source.rights.status !== 'determined') { blocks.push('SOURCE_RIGHTS_UNCLEAR'); detail.push('rights unclear'); }
  for (const key of ['store_copy', 'ai_processing', 'learner_display'] as const) {
    if (use[key] && !source.rights[key]) { if (!blocks.includes('SOURCE_USE_NOT_PERMITTED')) blocks.push('SOURCE_USE_NOT_PERMITTED'); detail.push(`${key} not permitted`); }
  }
  return { allowed: blocks.length === 0, blocks, detail };
}
