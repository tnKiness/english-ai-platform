// E-41 (D-05 N10): where a piece of learning content came from, and what that means for the learner profile.

export const CONTENT_ORIGINS = ['synthetic_fixture', 'sourced', 'ai_authored', 'learner_owned'] as const;
export type ContentOrigin = (typeof CONTENT_ORIGINS)[number];

export const isContentOrigin = (v: unknown): v is ContentOrigin => typeof v === 'string' && (CONTENT_ORIGINS as readonly string[]).includes(v);

/**
 * D-02 G0 after N10: evidence is synthetic — and never counts toward competency or Band — when the content is a
 * fixture, when its origin is unknown (content not released through the pipeline), or when FakeAdapter assessed it.
 * 'sourced', 'ai_authored' and 'learner_owned' content assessed by a real provider counts.
 */
export function isSyntheticEvidence(origin: ContentOrigin | null, provider: string | null): boolean {
  return origin === null || origin === 'synthetic_fixture' || provider === null || provider === 'fake';
}
