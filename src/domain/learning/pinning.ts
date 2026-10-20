import type { Revocation, VersionRef } from '../evidence/types.js';
import { isRevoked } from '../knowledge/revocation.js';

export interface AttemptPins { item: VersionRef; rubric: VersionRef }

const same = (a: VersionRef, b: VersionRef) => a.id === b.id && a.version === b.version && a.hash === b.hash;

/**
 * In-flight version pinning (04 §4.B.1): assessment of an attempt uses exactly the item/rubric pinned at
 * assignment. A newer rubric is not swapped in silently; a pinned-but-revoked dependency blocks recognition
 * and needs traced re-evaluation instead (06 §5.B.5).
 */
export function checkPinned(pins: AttemptPins, used: AttemptPins, revocations: readonly Revocation[]):
  { ok: true } | { ok: false; reason: 'PIN_MISMATCH' | 'PINNED_DEPENDENCY_REVOKED'; detail: string[] } {
  const mismatch = [...(same(pins.item, used.item) ? [] : ['item']), ...(same(pins.rubric, used.rubric) ? [] : ['rubric'])];
  if (mismatch.length > 0) return { ok: false, reason: 'PIN_MISMATCH', detail: mismatch };
  const revoked = [
    ...(isRevoked('item', pins.item.id, pins.item.version, revocations) ? ['item'] : []),
    ...(isRevoked('rubric', pins.rubric.id, pins.rubric.version, revocations) ? ['rubric'] : []),
  ];
  if (revoked.length > 0) return { ok: false, reason: 'PINNED_DEPENDENCY_REVOKED', detail: revoked };
  return { ok: true };
}
