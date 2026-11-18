// P5-5 (E-35): turning a Writing assessment result into recorded evidence and a diagnosis. The AI only proposes;
// here the application decides: which competencies may be recorded (only those the task asked about), the support
// impact (from hints actually shown, never from the AI), the focus limit, and whether hints pass the disclosure check.
import type { Assessment, WritingAssessment } from '../ai/provider-adapter.js';
import { isWritingAssessment } from '../ai/provider-adapter.js';
import type { Mode, Opportunity, Purpose, SupportImpact } from '../../domain/evidence/types.js';
import { verifyHintDisclosurePolicy, type PreGeneratedHints } from '../../domain/learning/scaffold-hints.js';
import type { ObservationDraft } from '../ports.js';

export interface CompetencyDef { competency_id: string; title: string; criterion: string }

/** Assessor context (blind to learner history, answer bank and hidden targets): the task, the criteria, the conditions. */
export function assessorContext(input: { task: { title: string; prompt: string; genre: string; min_words: number }; competencies: readonly CompetencyDef[]; mode: Mode; purpose: Purpose; is_repair: boolean }) {
  return {
    task: input.task,
    competencies: input.competencies.map((c) => ({ competency_id: c.competency_id, title: c.title, criterion: c.criterion })),
    conditions: { mode: input.mode, purpose: input.purpose, is_repair: input.is_repair },
  };
}

/**
 * Observations from a learning.v1 result. Competencies the task did not ask about are dropped; a missing competency
 * gets no observation (nothing is invented). Support impact is the application's call.
 */
export function observationsFromResult(result: WritingAssessment, input: { submission_id: string; allowed: readonly string[]; support_impact: SupportImpact }): ObservationDraft[] {
  const seen = new Set<string>();
  const drafts: ObservationDraft[] = [];
  for (const c of result.competencies) {
    if (!input.allowed.includes(c.competency_id) || seen.has(c.competency_id)) continue;
    seen.add(c.competency_id);
    drafts.push({
      observation_key: `${input.submission_id}:${c.competency_id}`, competency_id: c.competency_id, processing: result.processing,
      outcome: c.outcome, measurement_quality: c.measurement_quality, opportunity: c.opportunity, support_impact: input.support_impact,
    });
  }
  return drafts;
}

/** P3 synthetic path: the P0 single-outcome result from FakeAdapter, mapped with the scripted markers of the fixture. */
export function observationsFromLegacy(result: Assessment, input: { submission_id: string; primary: string; secondary: string; opportunity: Opportunity; regression: boolean; support_impact: SupportImpact }): ObservationDraft[] {
  return [
    { observation_key: `${input.submission_id}:${input.primary}`, competency_id: input.primary, processing: result.processing, outcome: result.outcome,
      measurement_quality: 'sufficient', opportunity: input.opportunity, support_impact: input.support_impact },
    { observation_key: `${input.submission_id}:${input.secondary}`, competency_id: input.secondary, processing: result.processing,
      outcome: input.regression ? 'not_met' : result.outcome === 'not_met' ? 'met' : result.outcome, measurement_quality: 'sufficient', opportunity: 'observed', support_impact: input.support_impact },
  ];
}

export interface AiDiagnosis {
  priority_issues: { issue_id: string; competency_id: string; location: string; symptom: string; hypothesis: string; expected_verification: string; impact: number; certainty: number }[];
  other_issues: string[];
  hints: PreGeneratedHints | null;
  disclosure: { ok: true } | { ok: false; reasons: string[] };
}

/**
 * Diagnosis proposed by the AI, checked by the application: only known competencies, scores clamped to 0–3, the
 * focus limit (D5) applied, and hints kept only when level 1–2 do not leak the level-3 rewrite (04 §2.D).
 * Hints that fail the check are not stored for display at all.
 */
export function diagnosisFromResult(result: WritingAssessment, input: { allowed: readonly string[]; focus_limit: number }): AiDiagnosis {
  const clamp = (n: number) => Math.max(0, Math.min(3, Math.round(n)));
  const known = result.diagnosis.priority_issues.filter((i) => input.allowed.includes(i.competency_id));
  const priority = known.slice(0, Math.max(1, input.focus_limit)).map((i, n) => ({ ...i, issue_id: `iss-${n + 1}`, impact: clamp(i.impact), certainty: clamp(i.certainty) }));
  const other = [...result.diagnosis.other_issues, ...known.slice(priority.length).map((i) => i.symptom)];
  const h = result.diagnosis.hints;
  if (!h) return { priority_issues: priority, other_issues: other, hints: null, disclosure: { ok: true } };
  const hints: PreGeneratedHints = {
    level_1: h.level_1, level_2: h.level_2, level_3: `${h.model_rewrite} — ${h.level_3_explanation}`,
    concept_check_question: h.concept_check_question, concept_check_expected: h.concept_check_expected,
    forbidden_in_early_levels: [h.model_rewrite],
  };
  const disclosure = verifyHintDisclosurePolicy(hints);
  return { priority_issues: priority, other_issues: other, hints: disclosure.ok ? hints : null, disclosure };
}

export { isWritingAssessment };
