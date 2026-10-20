// Deterministic parts of QC1–QC3 (qc-spec-1). Semantic rules are never decided here: they need an attestation or a
// verified AI audit on the same bundle hash. Preliminary filters only raise warnings (05 §5.C).
import { evaluateCoverage, type CoverageInput, type UsageRole } from '../../domain/knowledge/coverage.js';
import { sourceUseDecision, type SourceFacts } from '../../domain/knowledge/source-rights.js';
import type { QcStage } from '../../domain/knowledge/release-gate.js';

export interface Finding { code: string; unit: string | null; detail: string }
interface Governance {
  identity: { unit_id: string; unit_type: string; version: string };
  basis: { sources: { source_id: string; source_version: string; locator: string }[]; derivation: string };
  authority: string;
  validity: { status: string };
  verification: { lifecycle: string };
  dependencies: { units: { kind: string; id: string; version: string }[]; media: string[] };
  permissions: { roles: string[]; disclosure: string };
}
export interface BundleUnit { kind: 'item' | 'rubric' | 'knowledge' | 'policy'; id: string; version: string; value: { governance: Governance; body: Record<string, unknown> } }
export interface CheckInput {
  units: BundleUnit[];
  coverage: CoverageInput;
  usage_purposes: UsageRole[];
  sources: (sourceId: string, version: string) => (SourceFacts & { origin: string }) | undefined;
  media_ok: (sha: string) => boolean;
  released: (kind: string, id: string, version: string) => boolean;
  integrity_errors: string[];
  validate: (contract: string, value: unknown) => { ok: boolean; errors: string[] };
}

const KIND_OF_TYPE: Record<string, BundleUnit['kind']> = { task_item: 'item', rubric: 'rubric', foundation_policy: 'policy' };
const kindFor = (unitType: string) => KIND_OF_TYPE[unitType] ?? 'knowledge';
const key = (u: { kind: string; id: string; version: string }) => `${u.kind}/${u.id}@${u.version}`;
const AI_ROLES = ['blind_solver', 'verifier', 'assessor', 'repair_tutor', 'task_generator'];
const REVEALING = ['answer', 'explanation'];
const MECHANICAL = /\b(must|exactly|at least|phải|đúng|ít nhất)\b[^.]{0,40}\b\d+\b[^.]{0,30}\b(sentences?|câu|linking words?|từ nối|complex|phức)/i;

export function deterministicFindings(input: CheckInput): Finding[] {
  const f: Finding[] = [];
  const add = (code: string, unit: string | null, detail: string) => f.push({ code, unit, detail });
  for (const e of input.integrity_errors) add('QC1_INTEGRITY', null, e);
  const keys = new Set(input.units.map(key));
  const ids = new Map<string, number>();
  for (const u of input.units) ids.set(u.id, (ids.get(u.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) add('QC1_DUPLICATE_ID', id, `${n} units share id`);

  for (const u of input.units) {
    const k = key(u);
    const schema = input.validate('knowledge_unit', u.value);
    if (!schema.ok) { add('QC1_SCHEMA_INVALID', k, schema.errors.join('; ')); continue; }
    const g = u.value.governance;
    if (g.identity.unit_id !== u.id || g.identity.version !== u.version || kindFor(g.identity.unit_type) !== u.kind) add('QC1_IDENTITY_MISMATCH', k, `${g.identity.unit_type} ${g.identity.unit_id}@${g.identity.version}`);
    if (g.validity.status !== 'draft' || g.verification.lifecycle !== 'draft') add('QC1_STATUS_NOT_DRAFT', k, `${g.validity.status}/${g.verification.lifecycle}`);
    for (const d of g.dependencies.units) if (!keys.has(key(d)) && !input.released(d.kind, d.id, d.version)) add('QC1_DEPENDENCY_MISSING', k, key(d));
    const media = [...g.dependencies.media, ...(g.identity.unit_type === 'task_item' ? ((u.value.body.stimulus as { media: string[] }).media) : [])];
    for (const sha of new Set(media)) if (!input.media_ok(sha)) add('QC1_MEDIA_INVALID', k, sha);

    const roles = g.permissions.roles;
    if (REVEALING.includes(g.permissions.disclosure) && roles.some((r) => r === 'learner' || r === 'blind_solver')) add('QC1_PERMISSION_INVALID', k, `${g.permissions.disclosure} granted to ${roles.join(',')}`);
    if (g.identity.unit_type === 'answer_key' && !REVEALING.includes(g.permissions.disclosure)) add('QC1_PERMISSION_INVALID', k, 'answer key must be disclosure answer/explanation');
    if (g.identity.unit_type === 'task_item' && (g.permissions.disclosure !== 'prompt' || !roles.includes('blind_solver'))) add('QC1_PERMISSION_INVALID', k, 'task item must be a prompt-level view granted to blind_solver');

    // Source Registry rules (D-05): stored copy always; AI processing and learner display only when granted roles need them.
    const use = { store_copy: true, ai_processing: roles.some((r) => AI_ROLES.includes(r)), learner_display: roles.includes('learner') };
    for (const s of g.basis.sources) {
      const decision = sourceUseDecision(input.sources(s.source_id, s.source_version), use);
      for (const b of decision.blocks) add(`QC1_${b}`, k, `${s.source_id}@${s.source_version}: ${decision.detail.join(', ')}`);
    }
    // QC2 deterministic: basis present for sourced statements; official label only on official sources.
    if (['extracted', 'interpreted', 'authored_from_sources'].includes(g.basis.derivation) && g.basis.sources.length === 0) add('QC2_BASIS_MISSING', k, g.basis.derivation);
    if (g.authority === 'official_regulation' && (g.basis.sources.length === 0 || g.basis.sources.some((s) => input.sources(s.source_id, s.source_version)?.origin !== 'official'))) {
      add('QC2_OFFICIAL_LABEL_UNSUPPORTED', k, 'official_regulation needs official sources only');
    }
    // QC3 deterministic: product policy comes from Parts 1–4, mapped not re-sourced.
    if (g.authority === 'product_policy' || g.identity.unit_type === 'foundation_policy') {
      const ref = typeof u.value.body.policy_ref === 'string' ? u.value.body.policy_ref : '';
      if (g.identity.unit_type !== 'foundation_policy' || g.authority !== 'product_policy' || g.basis.derivation !== 'product_policy_mapping' || !/^0[1-4] §/.test(ref)) {
        add('QC3_POLICY_REF_MISSING', k, `policy_ref=${ref || '-'}`);
      }
    }
    if (['rubric', 'scaffold', 'micro_lesson', 'generation_spec'].includes(g.identity.unit_type) && MECHANICAL.test(JSON.stringify(u.value.body))) add('QC3_MECHANICAL_RULE_SUSPECT', k, 'counting rule wording; review semantically');
  }

  // Each task needs a complete answer key; the leak filter is preliminary only.
  for (const item of input.units.filter((u) => u.value.governance?.identity.unit_type === 'task_item')) {
    const body = item.value.body as { questions: { question_id: string; prompt: string; response_type: string }[]; prompt: string; stimulus: { text: string | null } };
    const keyUnit = input.units.find((u) => u.value.governance?.identity.unit_type === 'answer_key' && key((u.value.body as { item: { kind: string; id: string; version: string } }).item) === key(item));
    const answers = (keyUnit?.value.body as { answers: { question_id: string; accepted: string[] }[] } | undefined)?.answers ?? [];
    const missing = body.questions.filter((q) => !answers.some((a) => a.question_id === q.question_id)).map((q) => q.question_id);
    if (!keyUnit || missing.length > 0) add('QC1_ANSWER_KEY_MISSING', key(item), keyUnit ? `missing ${missing.join(',')}` : 'no answer_key');
    const visible = [body.prompt, body.stimulus.text ?? '', ...body.questions.map((q) => q.prompt)].join('\n').toLowerCase();
    for (const q of body.questions.filter((x) => x.response_type === 'short_text' || x.response_type === 'essay')) {
      for (const a of answers.find((x) => x.question_id === q.question_id)?.accepted ?? []) {
        if (a.length >= 4 && visible.includes(a.toLowerCase())) add('QC1_ANSWER_LEAK_PRELIMINARY', key(item), `${q.question_id} accepted answer appears in learner-visible text`);
      }
    }
  }
  for (const g of evaluateCoverage(input.coverage, input.usage_purposes)) if (!g.granted) add('QC1_COVERAGE_GAP', null, `${g.usage_role}: ${g.blocked_reasons.join(',')}`);
  return f;
}

export interface SpecRules { stages: { stage: QcStage; rules: { code: string; severity: 'blocking' | 'function_blocking' | 'warning'; method: string }[] }[] }

/** Deterministic part of one stage: FAIL on any blocking finding; function_blocking and warnings do not fail it. */
export function stageOutcome(spec: SpecRules, stage: QcStage, findings: Finding[]): { status: 'PASS' | 'FAIL'; findings: (Finding & { severity: string })[] } {
  const rules = spec.stages.find((s) => s.stage === stage)?.rules ?? [];
  const mine = findings.filter((x) => x.code.startsWith(`${stage}_`)).map((x) => {
    const rule = rules.find((r) => r.code === x.code);
    if (!rule) throw new Error(`Finding ${x.code} has no rule in the QC spec`);
    return { ...x, severity: rule.severity };
  });
  return { status: mine.some((x) => x.severity === 'blocking') ? 'FAIL' : 'PASS', findings: mine };
}

/** Which stage/parts must PASS before release, derived from the spec (deterministic always; semantic if declared). */
export function requiredParts(spec: SpecRules): { stage: QcStage; part: 'deterministic' | 'semantic' }[] {
  return spec.stages.flatMap((s) => [
    { stage: s.stage, part: 'deterministic' as const },
    ...(s.rules.some((r) => r.method === 'semantic') ? [{ stage: s.stage, part: 'semantic' as const }] : []),
  ]);
}
