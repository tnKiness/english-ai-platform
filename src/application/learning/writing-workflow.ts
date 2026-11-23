// Learning Workflow & Frame service cho P3-1, P3-2, P3-3 (01 Bước 1–9, 02 §2–5, 03 §1–2, 04 §2, 06 §2).
// Dùng lại repositories P1, Rule Engine P1, pipeline P2 và FakeAdapter. Mọi kết quả từ FakeAdapter đều
// gắn nhãn synthetic: true và không bao giờ nâng trạng thái năng lực thật hay suy ra Band (D-02).
import { createHash, randomUUID } from 'node:crypto';
import { CLI_PROVIDERS } from '../ai/subscription-guard.js';
import { isWritingAssessment, type AiResult, type Assessment } from '../ai/provider-adapter.js';
import { DATA_POLICY } from '../context/scoped-reader.js';
import { classifyEvidence } from '../../domain/evidence/attribution.js';
import { concludeCompetency, summarizeEvidence, type ClassifiedObservation, type Conclusion } from '../../domain/evidence/inference.js';
import type { Mode, ObservationFacts, Opportunity, Outcome, Purpose } from '../../domain/evidence/types.js';
import { assessNovelty } from '../../domain/knowledge/novelty.js';
import { effectiveObservations } from '../../domain/knowledge/revocation.js';
import { decideStep6Branch, sliceUnlockedHints, verifyHintDisclosurePolicy, type PreGeneratedHints, type Step6Branch, type VisibleHintSlice } from '../../domain/learning/scaffold-hints.js';
import { filterEligible, type TaskCandidate } from '../../domain/scheduling/eligibility.js';
import { studyDayOf } from '../../domain/scheduling/study-day.js';
import { decideCompetency, effectiveSources, isIndependent, type CompetencyDecision, type ConstraintKind, type EvidenceRecord, type Modality, type TaskBreadth } from '../../domain/policy/competency.js';
import { hypothesisStatus } from '../../domain/policy/hypothesis.js';
import type { LoadedPolicy } from '../../domain/policy/params.js';
import { DAY_MS } from '../../domain/policy/params.js';
import { focusLimit, frequencyScore, goalRelevance, rankTasks, type PriorityInput, type Skill } from '../../domain/policy/priority.js';
import { afterVerification, needsDirectCheck, verificationStatus, type ScheduleAction } from '../../domain/policy/verification.js';
import { loadCompetencyPolicy } from '../../infrastructure/policy/competency-policy.js';
import { FakeAdapter } from '../../infrastructure/ai/fake-adapter.js';
import { canonicalJson } from '../../infrastructure/files/paths.js';
import type { Store } from '../../infrastructure/sqlite/store.js';
import { processNextJob } from '../../worker/worker.js';
import type { ObservationDraft } from '../ports.js';
import { submitForAssessment } from './submit-for-assessment.js';
import { assessorContext, diagnosisFromResult, observationsFromLegacy, observationsFromResult, type CompetencyDef } from './writing-assessment.js';
import { isSyntheticEvidence } from '../../domain/knowledge/content-origin.js';
import { FrameworkAuthoringService, type FrameworkDocument } from '../authoring/framework-authoring.js';
import { resolve } from 'node:path';
import { FRAMEWORK_POLICY_FILES, loadFrameworkPolicy } from '../../infrastructure/authoring/framework-sources.js';
import { aiWritingItem, servableAiWritingItems, type AiWritingItem } from './writing-catalog.js';

export const SYNTHETIC_COMPETENCY_ID = 'syn.writing.tr.clear_position';
export const SYNTHETIC_SECONDARY_COMPETENCY_ID = 'syn.writing.cc.paragraph_cohesion';
export const SYNTHETIC_SPEAKING_TEXT_COMPETENCY_ID = 'syn.speaking_text.idea_development';
export const SYNTHETIC_WRITING_RUBRIC_ID = 'syn-writing-rubric';
export const SYNTHETIC_WRITING_PKG_ID = 'syn-writing-loop-pkg';
export const SYNTHETIC_ITEM_LESSON_ID = 'syn-writing-task2-lesson';
export const SYNTHETIC_ITEM_7A_ID = 'syn-writing-task2-7a';
export const SYNTHETIC_ITEM_7B_ID = 'syn-writing-task2-7b';
export const SYNTHETIC_ITEM_9_ID = 'syn-writing-task2-step9';
export const SYNTHETIC_MICRO_LESSON_ID = 'syn-writing-micro-lesson';

/** Cụm đáp án/mẫu sửa hoàn chỉnh của Nấc 3 — bị cấm tuyệt đối ở Nấc 1, Nấc 2 và khi sang 7A. */
export const SYNTHETIC_SECRET_REWRITE = 'SYNTHETIC-LEVEL3-SAMPLE-REWRITE: While public libraries preserve equal access to printed archives, digital platforms complement them only when municipalities fund both.';
export const SYNTHETIC_KEY_SECRET = 'SYNTHETIC-HIDDEN-ANSWER-KEY-DO-NOT-LEAK-TO-7A';

export interface LearnerGoalRecord {
  goal_id: string;
  target_band_overall: number;
  target_listening: number;
  target_reading: number;
  target_writing: number;
  target_speaking: number;
  exam_type: 'academic' | 'general_training';
  exam_date: string | null;
  daily_minutes: number;
  weekly_minutes: number;
  updated_at: string;
}

export interface PriorityIssue {
  issue_id: string;
  competency_id: string;
  location: string;
  symptom: string;
  hypothesis: string;
  hypothesis_status: 'initial' | 'insufficient_evidence' | 'confirmed' | 'rejected';
  expected_verification: string;
  /** D1 dimensions proposed by a real AI assessor (0–3), clamped by the app; absent for synthetic diagnoses. */
  impact?: number;
  certainty?: number;
}

export interface DiagnosisView {
  diagnosis_id: string;
  submission_id: string;
  job_id: string;
  synthetic: boolean;
  priority_issues: PriorityIssue[];
  other_issues_count: number;
  other_issues_summary: string[];
  scaffold: VisibleHintSlice;
}

export interface AttemptWorkspaceView {
  attempt: {
    attempt_id: string;
    mode: Mode;
    purpose: Purpose;
    state: string;
    item: { id: string; version: string; hash: string };
    rubric: { id: string; version: string; hash: string };
    created_at: string;
  };
  task_prompt: {
    title: string;
    prompt: string;
    skill: 'writing' | 'speaking_text';
    genre: string;
    min_words: number;
    recommended_minutes: number;
    criteria_summary: string[];
    input_support: { outline_suggestions: string[]; vocabulary_frame: string[] } | null;
  };
  draft: {
    latest_text: string;
    snapshot_version: number | null;
    saved_at: string | null;
  };
  submissions: {
    submission_id: string;
    revision: number;
    kind: 'original' | 'repair';
    repair_attempt_index: number;
    content: string;
    created_at: string;
    outcome: Outcome | null;
    synthetic: boolean;
  }[];
  loop: {
    origin_attempt_id: string | null;
    competency_id: string;
    step: number;
    unlocked_hint_level: 0 | 1 | 2 | 3;
    learner_choice: 'try_more' | 'direct_explanation' | null;
    clarification_count: number;
    repair_attempts: number;
    max_guided_repairs: number;
    offer_direct_explanation: boolean;
    concept_check_passed: boolean | null;
    step6_branch: Step6Branch | null;
    step6_completed: boolean;
    step6_lesson: { title: string; explanation: string; contrast_examples: string[]; concept_question: string } | null;
    /** E-50: AI-authored prompts only — the key idea, returned once, right after the learner answered (self-check). */
    step6_expected?: string | null;
    /** E-50: true when Bước 6 is a learner self-check against the key idea (AI-authored prompt). */
    step6_self_check?: boolean;
    linked_7a_attempt_id: string | null;
    synthetic: boolean;
  } | null;
  diagnosis: DiagnosisView | null;
  /** P5-5: state of the assessment job of the latest submission while it has no diagnosis yet (real AI mode). */
  assessment: { submission_id: string; job_state: string; error: string | null; mode: 'synthetic' | 'real' } | null;
}

/** Competencies of the synthetic Writing pack with the criterion text sent to the assessor (P5-5). */
export const WRITING_COMPETENCIES: readonly (CompetencyDef & { skill: 'writing' | 'speaking_text'; description: string })[] = [
  { competency_id: SYNTHETIC_COMPETENCY_ID, title: 'Writing Task 2 — Duy trì lập trường nhất quán (Task Response)', skill: 'writing',
    description: 'Trả lời đầy đủ các phần của đề bài và giữ lập trường rõ ràng, nhất quán xuyên suốt các đoạn văn.',
    criterion: 'Task Response: addresses all parts of the task and keeps a clear, consistent position from introduction to conclusion.' },
  { competency_id: SYNTHETIC_SECONDARY_COMPETENCY_ID, title: 'Writing Task 2 — Tổ chức đoạn văn & liên kết (Coherence & Cohesion)', skill: 'writing',
    description: 'Sắp xếp luận điểm mạch lạc, mỗi đoạn một ý trọng tâm rõ ràng và dùng phương tiện liên kết tự nhiên.',
    criterion: 'Coherence and Cohesion: logical paragraphing with one clear central idea per paragraph and natural linking.' },
  { competency_id: SYNTHETIC_SPEAKING_TEXT_COMPETENCY_ID, title: 'Speaking (dạng văn bản theo E-11) — Phát triển ý & từ vựng', skill: 'speaking_text',
    description: 'Lên ý tưởng, dàn ý và lựa chọn từ vựng dạng văn bản; chưa chấm phát âm hay âm thanh trực tiếp (D-06).',
    criterion: 'Idea development and vocabulary for a spoken answer written as text; no pronunciation judgement.' },
];

const DEFAULT_PREGENERATED_HINTS: PreGeneratedHints = {
  level_1: 'Nấc 1 (Chỉ vị trí & câu hỏi định hướng): Hãy xem lại câu cuối mở bài và câu chủ đề đoạn 2. Lập luận của bạn đang nghiêng về bên nào, hay đang tự mâu thuẫn giữa hai đoạn?',
  level_2: 'Nấc 2 (Nhắc kiến thức liên quan): Trong bài thảo luận hai quan điểm kèm ý kiến cá nhân (Task Response), bạn cần giữ một lập trường nhất quán từ mở bài đến kết bài và dùng mệnh đề nhượng bộ (While/Although...) thay vì phủ nhận hoàn toàn câu trước.',
  level_3: `${SYNTHETIC_SECRET_REWRITE} — Giải thích ngắn: Câu mẫu dùng cấu trúc nhượng bộ "While..." để thừa nhận vai trò của nền tảng số nhưng giữ vững lập trường chính là cần tài trợ cho cả hai.`,
  concept_check_question: 'Vì sao việc nêu hai ý kiến trái ngược nhau ở đoạn 1 và đoạn 2 mà không có mệnh đề nhượng bộ lại làm yếu tiêu chí Task Response?',
  concept_check_expected: 'mâu thuẫn lập trường',
  forbidden_in_early_levels: [SYNTHETIC_SECRET_REWRITE, SYNTHETIC_KEY_SECRET, 'While public libraries preserve equal access to printed archives'],
};

interface SyntheticItemMeta {
  id: string;
  title: string;
  prompt: string;
  skill: 'writing' | 'speaking_text';
  genre: string;
  family: string;
  purpose: Purpose;
  mode: Mode;
  estimated_minutes: number;
  meets_min_scope: boolean;
  /** D-02 A4/A5: short task or composite (whole paragraph / essay). */
  task_scope: TaskBreadth;
  /** D-02 condition: situational/meaning constraint vs explicit structure instruction. */
  constraint: ConstraintKind;
  competencies: string[];
  outline_suggestions: string[];
  vocabulary_frame: string[];
}

const SYNTHETIC_ITEMS: readonly SyntheticItemMeta[] = [
  {
    id: SYNTHETIC_ITEM_LESSON_ID,
    title: 'Writing Task 2 — Thư viện công cộng và nền tảng số (Synthetic)',
    prompt: '[Synthetic Task] Some people believe municipal budgets should prioritise digital archives over physical public libraries. Discuss both views and give your own opinion.',
    skill: 'writing',
    genre: 'Discussion + Opinion (Task 2)',
    family: 'syn-writing-family-libraries',
    purpose: 'lesson',
    mode: 'guided',
    estimated_minutes: 25,
    meets_min_scope: true,
    task_scope: 'composite',
    constraint: 'semantic',
    competencies: [SYNTHETIC_COMPETENCY_ID, SYNTHETIC_SECONDARY_COMPETENCY_ID],
    outline_suggestions: [
      'Mở bài: Paraphrase hai quan điểm và nêu rõ lập trường xuyên suốt của bạn.',
      'Thân bài 1: Lợi ích của lưu trữ số (tiếp cận từ xa, tìm kiếm nhanh).',
      'Thân bài 2: Giá trị không thể thay thế của thư viện vật lý và lý do cần kết hợp cả hai.',
    ],
    vocabulary_frame: ['municipal allocation (phân bổ ngân sách đô thị)', 'equitable access (tiếp cận công bằng)', 'complement rather than replace (bổ trợ thay vì thay thế)'],
  },
  {
    id: SYNTHETIC_ITEM_7A_ID,
    title: 'Writing Task 2 (7A Kiểm chứng chuyển giao) — Giao thông công cộng miễn phí (Synthetic)',
    prompt: '[Synthetic 7A Transfer Task] Some cities propose making all public transport free of charge, funded entirely by local taxes. To what extent do you agree or disagree?',
    skill: 'writing',
    genre: 'Opinion / Agree-Disagree (Task 2)',
    family: 'syn-writing-family-transport',
    purpose: '7A',
    mode: 'self_practice',
    estimated_minutes: 20,
    meets_min_scope: true,
    task_scope: 'composite',
    constraint: 'semantic',
    competencies: [SYNTHETIC_COMPETENCY_ID, SYNTHETIC_SECONDARY_COMPETENCY_ID],
    outline_suggestions: [],
    vocabulary_frame: [],
  },
  {
    id: SYNTHETIC_ITEM_7B_ID,
    title: 'Writing Task 2 (7B Kiểm chứng tích hợp) — Quy hoạch không gian xanh đô thị (Synthetic)',
    prompt: '[Synthetic 7B Integrated Task] Rapid urbanisation often reduces public green spaces. Some argue housing must come first, while others insist parks are essential for civic health. Discuss both views and give your opinion.',
    skill: 'writing',
    genre: 'Discussion + Opinion (Task 2)',
    family: 'syn-writing-family-urban-parks',
    purpose: '7B',
    mode: 'self_practice',
    estimated_minutes: 30,
    meets_min_scope: true,
    task_scope: 'composite',
    constraint: 'semantic',
    competencies: [SYNTHETIC_COMPETENCY_ID, SYNTHETIC_SECONDARY_COMPETENCY_ID],
    outline_suggestions: [],
    vocabulary_frame: [],
  },
  {
    id: SYNTHETIC_ITEM_9_ID,
    title: 'Writing Task 2 (Bước 9 Bảo trì giãn cách) — Đào tạo nghề và đại học (Synthetic)',
    prompt: '[Synthetic Step 9 Maintenance Task] Many employers value practical vocational training as much as university degrees. Discuss the advantages of both pathways and state your own position.',
    skill: 'writing',
    genre: 'Discussion + Opinion (Task 2)',
    family: 'syn-writing-family-vocational',
    purpose: '9',
    mode: 'exam',
    estimated_minutes: 30,
    meets_min_scope: true,
    task_scope: 'composite',
    constraint: 'semantic',
    competencies: [SYNTHETIC_COMPETENCY_ID, SYNTHETIC_SECONDARY_COMPETENCY_ID],
    outline_suggestions: [],
    vocabulary_frame: [],
  },
];

/** E-49: one Writing item as the workflow sees it — a synthetic fixture item or a released AI-authored prompt. */
type ItemMeta = Omit<SyntheticItemMeta, 'purpose'> & { purpose: Purpose | null; synthetic: boolean; min_words: number; rubric: { id: string; version: string }; framework_version: string | null; package: { id: string; version: string } };
type CompetencyInfo = CompetencyDef & { skill: 'writing' | 'speaking_text'; description: string };
const AI_ITEM_MODES: readonly Mode[] = ['self_practice', 'exam'];
type FrameworkSkill = 'writing' | 'speaking';

export class LearningWorkflowService {
  /** D-02 v1 (E-33). null = no approved policy file → every conclusion stays "chưa đủ kết luận". */
  readonly policy: LoadedPolicy | null;
  /**
   * P5-5 (E-35). 'synthetic' (default): FakeAdapter runs inline on synthetic content. 'real': the job waits for the
   * learning worker (`npm run worker -- --learning`), which goes through the gateway and a D-01 verified provider.
   */
  readonly aiMode: 'synthetic' | 'real';
  /** E-49/E-52: a version of a competency framework (undefined = the approved one) per skill; null when there is none. */
  private readonly framework: (version?: string, skill?: FrameworkSkill) => FrameworkDocument | null;
  constructor(private store: Store, policy?: LoadedPolicy | null, options: { aiMode?: 'synthetic' | 'real'; framework?: (version?: string, skill?: FrameworkSkill) => FrameworkDocument | null } = {}) {
    this.policy = policy === undefined ? loadCompetencyPolicy() : policy;
    this.aiMode = options.aiMode ?? (process.env.STUDY_ENGLISH_LEARNING_AI === 'real' ? 'real' : 'synthetic');
    this.framework = options.framework ?? ((version, skill = 'writing') => {
      try {
        const svc = new FrameworkAuthoringService(store, loadFrameworkPolicy(resolve(FRAMEWORK_POLICY_FILES[skill]!)), () => ({ sources: [], haystacks: [], missing: [] }));
        return version ? svc.document(version) : svc.approved();
      } catch { return null; }
    });
  }

  /** Metadata of a Writing item: synthetic fixture first, then a released AI-authored prompt (E-49). */
  private itemMeta(id: string | undefined, version = 'v1'): ItemMeta | undefined {
    if (!id) return undefined;
    const syn = SYNTHETIC_ITEMS.find((m) => m.id === id);
    if (syn) return { ...syn, synthetic: true, min_words: 150, rubric: { id: SYNTHETIC_WRITING_RUBRIC_ID, version: 'v1' }, framework_version: null, package: { id: SYNTHETIC_WRITING_PKG_ID, version: 'v1' } };
    const ai = aiWritingItem(this.store, id, version);
    if (!ai) return undefined;
    return {
      id: ai.id, title: ai.title, prompt: ai.prompt, skill: ai.skill, genre: ai.genre_label, family: ai.family, purpose: null, mode: 'self_practice',
      estimated_minutes: ai.estimated_minutes, meets_min_scope: true, task_scope: ai.task_scope, constraint: ai.constraint, competencies: ai.competencies,
      outline_suggestions: [], vocabulary_frame: [], synthetic: false, min_words: ai.min_words, rubric: ai.rubric, framework_version: ai.framework_version, package: ai.package,
    };
  }

  /** Competency of the framework version an item was written for (falls back to the approved one). */
  private frameworkCompetencies(version?: string | null, skill: FrameworkSkill = 'writing'): CompetencyInfo[] {
    const fw = (version ? this.framework(version, skill) : null) ?? this.framework(undefined, skill);
    return (fw?.competencies ?? []).map((c) => ({ competency_id: c.competency_id, title: c.title_vi, criterion: c.assessor_criterion, skill: skill === 'speaking' ? 'speaking_text' as const : 'writing' as const, description: c.target_claim }));
  }

  /** Every competency the profile shows: the synthetic fixtures and the approved Writing Task 2 framework (E-49). */
  private competencyDefs(): CompetencyInfo[] {
    const out: CompetencyInfo[] = [...WRITING_COMPETENCIES];
    for (const c of [...this.frameworkCompetencies(), ...this.frameworkCompetencies(undefined, 'speaking')]) if (!out.some((w) => w.competency_id === c.competency_id)) out.push(c);
    return out;
  }

  /** The competency the attempt's loop focuses on (hints, self-repair, verification). */
  private loopCompetency(attemptId: string): string {
    return (this.store.db.prepare('SELECT competency_id FROM writing_loop_states WHERE attempt_id = ?').get(attemptId) as { competency_id: string } | undefined)?.competency_id ?? SYNTHETIC_COMPETENCY_ID;
  }

  /**
   * E-50: a released AI-authored prompt that measures the competency, has the requested breadth (short = paragraph for
   * 7A, composite = essay for 7B/9), is still novel for the learner (05 §6.B, 04 §5.B.4) and is not already assigned
   * to an open task. Deterministic order; undefined when the bank has none (C5 replenishes it).
   */
  private pickVerificationItem(competencyId: string, breadth: 'short' | 'composite'): AiWritingItem | undefined {
    const exposures = this.store.learning.exposures();
    const busy = new Set((this.store.db.prepare("SELECT item_id FROM scheduled_tasks WHERE state IN ('PENDING', 'AWAITING_OPPORTUNITY', 'IN_PROGRESS')").all() as { item_id: string }[]).map((r) => r.item_id));
    return servableAiWritingItems(this.store)
      .filter((i) => i.task_scope === breadth && i.competencies.includes(competencyId) && !busy.has(i.id))
      .filter((i) => assessNovelty({ item_id: i.id, item_family_id: i.family, shared_stimulus_id: null, derived_from: [] }, exposures).novelty === 'novel')
      .sort((a, b) => a.id.localeCompare(b.id))[0];
  }

  /** No novel item to verify a framework competency: an open coverage gap tells the learner to author more (C5). */
  private verificationGap(competencyId: string, purpose: Purpose, at: string): void {
    const scope = purpose === '7A' ? 'paragraph' : 'essay';
    this.store.builder.openReview({ dedupe_key: `coverage:verify:${competencyId}:${purpose}:${studyDayOf(new Date(at))}`, kind: 'coverage_gap', target_kind: 'competency', target_id: competencyId, target_version: null,
      severity: 'normal', summary: `Thiếu đề ${scope === 'paragraph' ? 'đoạn' : 'bài luận'} chưa xem để kiểm chứng ${purpose} cho ${competencyId}`,
      detail: { competency_id: competencyId, purpose, remedy: `npm.cmd run author -- items${scope === 'paragraph' ? ' --paragraph' : ''} --focus ${competencyId}` } });
  }

  /**
   * E-49 "kho đề": released AI-authored Writing Task 2 prompts, metadata only (no prompt text: reading it is an
   * exposure, recorded when an attempt starts). `seen` = any exposure of the item already exists.
   */
  writingBank() {
    const exposures = this.store.learning.exposures();
    // Paragraph tasks are kept for 7A transfer checks: showing them here would spend their novelty (E-50).
    const items = servableAiWritingItems(this.store, ['ai_authored', 'learner_owned']).filter((i) => i.task_scope === 'composite').map((i) => ({
      item_id: i.id, item_version: i.version, skill: i.skill, title: i.origin === 'learner_owned' ? `${i.title} (đề của bạn)` : i.title, origin: i.origin, genre: i.genre_label, estimated_minutes: i.estimated_minutes, min_words: i.min_words,
      competencies: i.competencies.length, seen: exposures.some((e) => e.item_id === i.id),
    }));
    return {
      ai_mode: this.aiMode, available: this.aiMode === 'real',
      note: this.aiMode === 'real'
        ? 'Đề do AI soạn theo khung năng lực đã duyệt, đã qua QC1–QC4. Bài được chấm thật theo các năng lực của khung; độ khó chỉ là ước tính.'
        : 'Đề AI chỉ làm được khi app chạy chế độ chấm thật (STUDY_ENGLISH_LEARNING_AI=real và worker học); FakeAdapter không chấm được đề thật.',
      items: items.sort((a, b) => Number(a.seen) - Number(b.seen) || a.title.localeCompare(b.title)),
    };
  }

  /** Khởi tạo gói học Writing synthetic đã kích hoạt để phục vụ luồng P3 độc lập (idempotent). */
  ensureSyntheticWritingCatalog(): void {
    const existing = this.store.knowledge.releaseState(SYNTHETIC_WRITING_PKG_ID, 'v1');
    if (existing === 'active') return;
    this.store.uow.run(() => {
      if (this.store.knowledge.releaseState(SYNTHETIC_WRITING_PKG_ID, 'v1') === 'active') return;
      const rubricRef = this.store.json.put('rubric', SYNTHETIC_WRITING_RUBRIC_ID, 'v1', {
        synthetic: true,
        criteria: ['Task Response: clear position throughout', 'Coherence and Cohesion: logical paragraphing'],
        notes: ['Synthetic rubric for P3 closed-loop writing tests; no real Band mapping'],
      });
      const lessonKnowledgeRef = this.store.json.put('knowledge', SYNTHETIC_MICRO_LESSON_ID, 'v1', {
        synthetic: true,
        title: 'Micro-lesson: Giữ lập trường nhất quán với mệnh đề nhượng bộ',
        explanation: 'Khi đề bài yêu cầu thảo luận hai quan điểm và nêu ý kiến cá nhân, đừng viết đoạn 1 đồng tình tuyệt đối rồi đoạn 2 bác bỏ chính mình. Hãy nêu rõ điều kiện hoặc mức độ bằng cấu trúc nhượng bộ (While X is valid in terms of..., Y remains essential because...).',
        contrast_examples: [
          'Chưa nhất quán: Digital libraries should replace all physical buildings. However, physical libraries must never be closed.',
          'Nhất quán (dùng nhượng bộ): While digital archives expand remote access, physical libraries remain indispensable community spaces.',
        ],
        secret_note: SYNTHETIC_KEY_SECRET,
      });
      const itemRegs = SYNTHETIC_ITEMS.map((m) => {
        const ref = this.store.json.put('item', m.id, 'v1', {
          synthetic: true,
          title: m.title,
          prompt: m.prompt,
          skill: m.skill,
          genre: m.genre,
          min_words: 150,
          recommended_minutes: m.estimated_minutes,
          criteria_summary: ['Trả lời đủ các phần của đề và giữ lập trường rõ ràng (TR)', 'Tổ chức đoạn văn mạch lạc, liên kết tự nhiên (CC)'],
          outline_suggestions: m.outline_suggestions,
          vocabulary_frame: m.vocabulary_frame,
          competencies: m.competencies,
        });
        return { ref, item_family_id: m.family, shared_stimulus_id: null, media_ids: [] };
      });
      const pkgRef = this.store.json.put('package', SYNTHETIC_WRITING_PKG_ID, 'v1', {
        synthetic: true,
        content_origin: 'synthetic_fixture',
        items: SYNTHETIC_ITEMS.map((m) => m.id),
        rubric: SYNTHETIC_WRITING_RUBRIC_ID,
      });
      this.store.knowledge.registerPackage(pkgRef, 'verified', 'qc-spec-1', [rubricRef, lessonKnowledgeRef], itemRegs);
      this.store.knowledge.transition(SYNTHETIC_WRITING_PKG_ID, 'v1', 'active', 'synthetic P3 seed', pkgRef.hash);

      // Tạo sẵn nhiệm vụ bài học đầu tiên nếu chưa có nhiệm vụ nào trong lịch.
      const count = (this.store.db.prepare('SELECT COUNT(*) AS n FROM scheduled_tasks').get() as { n: number }).n;
      if (count === 0) {
        const at = this.store.now().toISOString();
        this.store.db.prepare(`INSERT INTO scheduled_tasks (task_id, origin_attempt_id, assigned_attempt_id, competency_id, item_id, item_version, rubric_id, rubric_version,
          purpose, mode, estimated_minutes, meets_min_scope, due_at, state, synthetic, created_at, updated_at)
          VALUES (?, NULL, NULL, ?, ?, 'v1', ?, 'v1', 'lesson', 'guided', 25, 1, ?, 'PENDING', 1, ?, ?)`).run(
          'task-syn-initial-lesson', SYNTHETIC_COMPETENCY_ID, SYNTHETIC_ITEM_LESSON_ID, SYNTHETIC_WRITING_RUBRIC_ID, at, at, at,
        );
      }
    });
  }

  // ---- Mục tiêu ban đầu & Cài đặt (01 Bước 1, 06 §2.1, §2.5) ----------------------------------
  getGoal(): LearnerGoalRecord | null {
    const row = this.store.db.prepare('SELECT * FROM learner_goals ORDER BY updated_at DESC LIMIT 1').get() as LearnerGoalRecord | undefined;
    return row ?? null;
  }

  saveGoal(input: Omit<LearnerGoalRecord, 'goal_id' | 'updated_at'>): LearnerGoalRecord {
    const at = this.store.now().toISOString();
    const existing = this.getGoal();
    const goalId = existing?.goal_id ?? 'learner-primary-goal';
    this.store.uow.run(() => {
      this.store.db.prepare(`INSERT INTO learner_goals (goal_id, target_band_overall, target_listening, target_reading, target_writing, target_speaking, exam_type, exam_date, daily_minutes, weekly_minutes, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (goal_id) DO UPDATE SET target_band_overall = excluded.target_band_overall, target_listening = excluded.target_listening,
          target_reading = excluded.target_reading, target_writing = excluded.target_writing, target_speaking = excluded.target_speaking,
          exam_type = excluded.exam_type, exam_date = excluded.exam_date, daily_minutes = excluded.daily_minutes, weekly_minutes = excluded.weekly_minutes, updated_at = excluded.updated_at`)
        .run(goalId, input.target_band_overall, input.target_listening, input.target_reading, input.target_writing, input.target_speaking, input.exam_type, input.exam_date ?? null, input.daily_minutes, input.weekly_minutes, at);
    });
    return this.getGoal()!;
  }

  // ---- Học hôm nay & Bộ điều phối (02 §5, 06 §2.2) --------------------------------------------
  todayView(availableMinutesOverride?: number) {
    this.ensureSyntheticWritingCatalog();
    const goal = this.getGoal();
    const availableMinutes = availableMinutesOverride ?? goal?.daily_minutes ?? 30;
    const nowIso = this.store.now().toISOString();

    // Bài đang làm dở (DRAFT, SUBMITTED, REPAIRING) của scope learner để tiếp tục ngay.
    const inProgress = this.store.db.prepare(`SELECT attempt_id, item_id, item_version, mode, purpose, state, updated_at
      FROM attempts WHERE scope = 'learner' AND attempt_id NOT IN (SELECT attempt_id FROM reading_sessions UNION SELECT attempt_id FROM audio_sessions) AND state IN ('DRAFT', 'SUBMITTED', 'REPAIRING') ORDER BY updated_at DESC`).all() as {
      attempt_id: string; item_id: string; item_version: string; mode: Mode; purpose: Purpose; state: string; updated_at: string;
    }[];

    // C4: a check waiting too long for an opportunity becomes a direct check with a situational constraint.
    if (this.policy) {
      const waiting = this.store.db.prepare("SELECT task_id FROM scheduled_tasks WHERE state = 'AWAITING_OPPORTUNITY'").all() as { task_id: string }[];
      if (waiting.length) this.store.uow.run(() => { for (const w of waiting) this.maybeDirectCheck(w.task_id, nowIso); });
    }

    const scheduledRows = this.store.db.prepare(`SELECT * FROM scheduled_tasks WHERE state IN ('PENDING', 'AWAITING_OPPORTUNITY') ORDER BY due_at, created_at`).all() as {
      task_id: string; origin_attempt_id: string | null; assigned_attempt_id: string | null; competency_id: string; item_id: string; item_version: string;
      rubric_id: string; rubric_version: string; purpose: Purpose; mode: Mode; estimated_minutes: number; meets_min_scope: number; due_at: string; state: string; synthetic: number;
    }[];

    const dueRows = scheduledRows.filter((r) => r.due_at <= nowIso);
    const futureRows = scheduledRows.filter((r) => r.due_at > nowIso);

    const candidates: TaskCandidate[] = dueRows.map((r) => {
      const servable = this.store.knowledge.servableItem(r.item_id, r.item_version, 'learner');
      const pkg = this.itemMeta(r.item_id, r.item_version)?.package ?? { id: SYNTHETIC_WRITING_PKG_ID, version: 'v1' };
      const releaseState = this.store.knowledge.releaseState(pkg.id, pkg.version) ?? 'draft';
      return {
        task_id: r.task_id,
        item: { id: r.item_id, version: r.item_version, item_family_id: servable.ok ? servable.item_family_id : 'unknown', shared_stimulus_id: servable.ok ? servable.shared_stimulus_id : null, derived_from: [] },
        package: { id: pkg.id, version: pkg.version, release_state: releaseState },
        competency_ids: [r.competency_id],
        purpose: r.purpose,
        mode: r.mode,
        estimated_minutes: r.estimated_minutes,
        meets_min_scope: r.meets_min_scope === 1,
        quality_gate_passed: true,
        resources_available: servable.ok,
      };
    });

    const filtered = filterEligible(
      candidates,
      { competency_ids: this.competencyDefs().map((c) => c.competency_id), available_minutes: availableMinutes },
      this.store.learning.exposures(),
      this.store.knowledge.revocations(),
    );

    const explainPurpose: Record<Purpose, string> = {
      lesson: 'Bài học & thực hành có hướng dẫn để chẩn đoán và sửa lỗi mục tiêu.',
      practice: 'Luyện tập củng cố kỹ năng mục tiêu.',
      '7A': 'Nhiệm vụ 7A mới (không gợi ý) để kiểm chứng xem bạn đã tự áp dụng được điểm vừa sửa chưa.',
      '7B': 'Nhiệm vụ 7B hoàn chỉnh để kiểm chứng khả năng tích hợp nhiều kỹ năng không làm tụt tiêu chí khác.',
      '9': 'Nhiệm vụ Bước 9 (ôn tập giãn cách đến hạn) để kiểm tra duy trì năng lực theo thời gian.',
    };

    // D-02 D: stage-2 ranking after the eligibility filter. AI dimensions are not produced yet → 1 each (D1 default).
    const policy = this.policy;
    const ranked = policy ? rankTasks(filtered.eligible.map((c) => this.priorityInput(dueRows.find((r) => r.task_id === c.task_id)!, policy)), this.store.now(), policy.params) : null;
    const ordered = ranked ? ranked.map((r) => filtered.eligible.find((c) => c.task_id === r.task_id)!) : filtered.eligible;

    const recommended = ordered.slice(0, 3).map((c) => {
      const row = dueRows.find((r) => r.task_id === c.task_id)!;
      const priority = ranked?.find((r) => r.task_id === c.task_id)?.priority ?? null;
      const meta = this.itemMeta(c.item.id, c.item.version);
      return {
        task_id: c.task_id,
        title: meta?.title ?? c.item.id,
        item_id: c.item.id,
        item_version: c.item.version,
        rubric_id: row.rubric_id,
        rubric_version: row.rubric_version,
        competency_id: row.competency_id,
        purpose: c.purpose,
        mode: c.mode,
        estimated_minutes: c.estimated_minutes,
        due_at: row.due_at,
        state: row.state,
        reason: explainPurpose[c.purpose],
        priority,
        synthetic: row.synthetic === 1,
      };
    });

    return {
      now: nowIso,
      goal,
      available_minutes: availableMinutes,
      speaking_mode_note: 'Speaking giai đoạn đầu (E-11): hỗ trợ ý tưởng, dàn ý và từ vựng dạng văn bản như Writing; chưa chấm audio/phát âm hay báo Band Speaking.',
      in_progress: inProgress.map((a) => ({
        ...a,
        title: this.itemMeta(a.item_id, a.item_version)?.title ?? a.item_id,
      })),
      recommended_tasks: recommended,
      deferred_or_ineligible: filtered.rejected,
      upcoming_scheduled: futureRows.map((r) => ({
        task_id: r.task_id,
        title: this.itemMeta(r.item_id, r.item_version)?.title ?? r.item_id,
        purpose: r.purpose,
        mode: r.mode,
        estimated_minutes: r.estimated_minutes,
        due_at: r.due_at,
        competency_id: r.competency_id,
        synthetic: r.synthetic === 1,
      })),
    };
  }

  // ---- Bắt đầu lượt làm bài & Autosave (06 §2.3) ----------------------------------------------
  startAttempt(input: { request_key: string; item_id?: string; item_version?: string; rubric_id?: string; rubric_version?: string; mode: Mode; purpose: Purpose; task_id?: string; competency_id?: string }): AttemptWorkspaceView {
    this.ensureSyntheticWritingCatalog();
    const itemId = input.item_id ?? SYNTHETIC_ITEM_LESSON_ID;
    const itemVersion = input.item_version ?? 'v1';
    const meta = this.itemMeta(itemId, itemVersion);
    if (!meta) throw Object.assign(new Error('Unsupported Writing item'), { statusCode: 409 });
    if (!meta.synthetic) {
      // E-49: AI-authored prompts are real content; they are assessed only by a real provider, as practice.
      if (this.aiMode !== 'real') throw Object.assign(new Error('Đề AI soạn chỉ làm được ở chế độ chấm thật (FakeAdapter không chấm đề thật)'), { statusCode: 409, code: 'AI_ITEM_NEEDS_REAL_MODE' });
      const verification = input.purpose === '7B' || input.purpose === '9';
      if (!AI_ITEM_MODES.includes(input.mode) || !(input.purpose === 'practice' || (verification && input.task_id))) {
        throw Object.assign(new Error('Đề AI soạn dùng cho luyện tập (tự luyện hoặc mô phỏng thi) hoặc cho nhiệm vụ kiểm chứng đã lập lịch'), { statusCode: 409, code: 'AI_ITEM_PRACTICE_ONLY' });
      }
      if (input.purpose === 'practice' && meta.task_scope !== 'composite') throw Object.assign(new Error('Đề đoạn chỉ dùng cho kiểm chứng 7A'), { statusCode: 409, code: 'AI_ITEM_PRACTICE_ONLY' });
      if (!this.store.knowledge.servableItem(itemId, itemVersion, 'learner').ok) throw Object.assign(new Error('Đề này hiện không được cấp (chưa phát hành, đã ngừng hoặc bị thu hồi)'), { statusCode: 409, code: 'ITEM_NOT_SERVABLE' });
    }
    const rubricId = meta.synthetic ? input.rubric_id ?? SYNTHETIC_WRITING_RUBRIC_ID : meta.rubric.id;
    const rubricVersion = meta.synthetic ? input.rubric_version ?? 'v1' : meta.rubric.version;
    const competencyId = meta.synthetic ? input.competency_id ?? SYNTHETIC_COMPETENCY_ID
      : input.competency_id && meta.competencies.includes(input.competency_id) ? input.competency_id : meta.competencies[0]!;

    if ((input.purpose === '7A' || input.purpose === '7B' || input.purpose === '9') && input.mode === 'guided') {
      throw new Error('Verification tasks (7A/7B/9) cannot run in guided mode');
    }

    const attempt = this.store.uow.run(() => {
      const created = this.store.learning.createAttempt({
        request_key: input.request_key,
        scope: 'learner',
        item: { id: itemId, version: itemVersion },
        rubric: { id: rubricId, version: rubricVersion },
        mode: input.mode,
        purpose: input.purpose,
      });

      const servable = this.store.knowledge.servableItem(itemId, itemVersion, 'learner');
      if (servable.ok) {
        this.store.learning.recordExposure({
          idempotency_key: `learner:prompt:${created.attempt_id}`,
          item: { id: itemId, version: itemVersion, hash: created.item.hash },
          item_family_id: servable.item_family_id,
          shared_stimulus_id: servable.shared_stimulus_id,
          surface: 'learner',
          scope: 'learner',
          level: 'prompt',
        });
      }

      const loopExists = this.store.db.prepare('SELECT 1 FROM writing_loop_states WHERE attempt_id = ?').get(created.attempt_id);
      if (!loopExists) {
        const at = this.store.now().toISOString();
        const step = input.purpose === '7A' || input.purpose === '7B' ? 7 : input.purpose === '9' ? 9 : 3;
        this.store.db.prepare(`INSERT INTO writing_loop_states (attempt_id, origin_attempt_id, competency_id, step, unlocked_hint_level, synthetic, updated_at)
          VALUES (?, NULL, ?, ?, 0, ?, ?)`).run(created.attempt_id, competencyId, step, this.aiMode === 'real' ? 0 : 1, at);
      }

      if (input.task_id) {
        this.store.db.prepare("UPDATE scheduled_tasks SET assigned_attempt_id = ?, state = 'IN_PROGRESS', updated_at = ? WHERE task_id = ?")
          .run(created.attempt_id, this.store.now().toISOString(), input.task_id);
      }
      return created;
    });

    return this.getWorkspaceView(attempt.attempt_id);
  }

  /**
   * Autosave lưu bền vững vào bảng snapshots ở server (06 §2.3, §6.A.3).
   * Trả về snapshot_id, snapshot_version và thời điểm đã lưu; lỗi thật sẽ ném ra để API trả mã lỗi.
   */
  autosave(attemptId: string, content: string): { attempt_id: string; snapshot_id: string; snapshot_version: number; saved_at: string } {
    const attempt = this.store.learning.getAttempt(attemptId);
    if (!attempt) throw Object.assign(new Error('Unknown attempt'), { statusCode: 404, code: 'UNKNOWN_ATTEMPT' });
    if (attempt.state === 'CLOSED') throw Object.assign(new Error('Attempt is already closed'), { statusCode: 409, code: 'ATTEMPT_CLOSED' });
    const snap = this.store.learning.saveSnapshot(attemptId, 'autosave', content);
    const row = this.store.db.prepare('SELECT created_at FROM snapshots WHERE snapshot_id = ?').get(snap.snapshot_id) as { created_at: string };
    return { attempt_id: attemptId, snapshot_id: snap.snapshot_id, snapshot_version: snap.snapshot_version, saved_at: row.created_at };
  }

  /**
   * Bước 3 (Guided mode): Khi mở gói hỗ trợ đầu vào (dàn ý/từ vựng gợi ý), chụp snapshot trước hỗ trợ
   * và ghi nhận assistance_event để phân tách đóng góp (01 Bước 3, 02 §2.C.2).
   */
  requestInputSupport(attemptId: string, requestKey: string, currentDraftText: string): { event_id: string; created: boolean; support: { outline_suggestions: string[]; vocabulary_frame: string[] } } {
    const attempt = this.store.learning.getAttempt(attemptId);
    if (!attempt) throw Object.assign(new Error('Unknown attempt'), { statusCode: 404 });
    if (attempt.mode !== 'guided') {
      throw Object.assign(new Error('Input support is only available in guided mode'), { statusCode: 403, code: 'MODE_FORBIDS_SUPPORT' });
    }
    const itemObj = this.store.json.get('item', attempt.item.id, attempt.item.version, attempt.item.hash) as { outline_suggestions?: string[]; vocabulary_frame?: string[] };
    const support = {
      outline_suggestions: itemObj.outline_suggestions ?? [],
      vocabulary_frame: itemObj.vocabulary_frame ?? [],
    };
    return this.store.uow.run(() => {
      const pre = this.store.learning.saveSnapshot(attemptId, 'pre_assistance', currentDraftText);
      // Nếu chưa có submission nào thì tạo assistance_event khi có submission, hoặc trả về support đã chụp pre_assistance snapshot.
      const sub = this.store.db.prepare('SELECT submission_id FROM submissions WHERE attempt_id = ? ORDER BY revision DESC LIMIT 1').get(attemptId) as { submission_id: string } | undefined;
      if (!sub) {
        return { event_id: pre.snapshot_id, created: true, support };
      }
      const rec = this.store.learning.recordAssistance({
        idempotency_key: `input-support:${attemptId}:${requestKey}`,
        attempt_id: attemptId,
        submission_id: sub.submission_id,
        hint_level: 0,
        content: canonicalJson(support),
        impacts: [{ competency_id: this.loopCompetency(attemptId), impact: 'affected', reduced_load: true }],
        pre_snapshot_id: pre.snapshot_id,
        post_snapshot_id: null,
      });
      return { ...rec, support };
    });
  }

  // ---- Bước 4–5: Nộp bài gốc / Nộp bản tự sửa & Chạy FakeAdapter (synthetic) ------------------
  async submitWriting(input: {
    attempt_id: string;
    request_key: string;
    content: string;
    is_repair?: boolean;
    opportunity_override?: Opportunity;
    adapter?: FakeAdapter;
  }): Promise<AttemptWorkspaceView> {
    this.ensureSyntheticWritingCatalog();
    const attempt = this.store.learning.getAttempt(input.attempt_id);
    if (!attempt) throw Object.assign(new Error('Unknown attempt'), { statusCode: 404 });
    if (!input.content.trim()) throw Object.assign(new Error('Submission content cannot be empty'), { statusCode: 400, code: 'EMPTY_SUBMISSION' });

    const latestSub = this.store.db.prepare('SELECT submission_id, revision, content_hash FROM submissions WHERE attempt_id = ? ORDER BY revision DESC LIMIT 1')
      .get(input.attempt_id) as { submission_id: string; revision: number; content_hash: string } | undefined;

    const isRepair = input.is_repair === true || latestSub !== undefined;
    if (isRepair && !latestSub) {
      throw Object.assign(new Error('Cannot submit a repair before an original submission'), { statusCode: 400, code: 'MISSING_ORIGINAL_SUBMISSION' });
    }

    const taskType = isRepair ? 'repair.assess' as const : 'writing.assess' as const;
    const { submission, job } = submitForAssessment(this.store, {
      request_key: input.request_key,
      attempt_id: input.attempt_id,
      content: input.content,
      ...(isRepair && latestSub ? { parent_submission_id: latestSub.submission_id } : {}),
      rubric: attempt.rubric,
      task_type: taskType,
      required_capabilities: ['text', 'structured_result'],
      eligible_providers: [...CLI_PROVIDERS],
      timeout_seconds: 60,
      policy_version: 'context-policy-1',
      context: this.assessorContextFor(attempt.item.id, attempt.mode, attempt.purpose, isRepair),
    });

    // Real AI mode: the job waits in the queue for the learning worker; the workspace finalises it when it completes.
    if (this.aiMode === 'real' && !input.adapter) return this.getWorkspaceView(input.attempt_id);

    await processNextJob({
      queue: this.store.queue,
      adapter: input.adapter ?? new FakeAdapter('success'),
      loadContext: (id) => this.store.learning.loadManifestPayload(id),
      interpret: (result: AiResult): ObservationDraft[] => this.interpretWriting(result, submission.submission_id, input.opportunity_override),
      owner: 'p3-synthetic-worker',
      leaseMs: 60_000,
      heartbeatMs: 10_000,
      provider: 'fake',
      claimOptions: { jobId: job.job_id },
    });
    this.finalizeAssessment(submission.submission_id);
    return this.getWorkspaceView(input.attempt_id);
  }

  /** Assessor context for a Writing item: task text, criteria of its competencies, conditions. No answers or history. */
  private assessorContextFor(itemId: string, mode: Mode, purpose: Purpose, isRepair: boolean) {
    const meta = this.itemMeta(itemId);
    const ids = meta?.competencies ?? [SYNTHETIC_COMPETENCY_ID];
    const defs: readonly CompetencyInfo[] = meta && !meta.synthetic ? this.frameworkCompetencies(meta.framework_version, meta.skill === 'speaking_text' ? 'speaking' : 'writing') : WRITING_COMPETENCIES;
    return assessorContext({
      task: { title: meta?.title ?? itemId, prompt: meta?.prompt ?? '', genre: meta?.genre ?? '', min_words: meta?.min_words ?? 150, skill: meta?.skill ?? 'writing' },
      competencies: defs.filter((c) => ids.includes(c.competency_id)),
      mode, purpose, is_repair: isRepair,
    });
  }

  /**
   * Observations from an assessment result (inline FakeAdapter or the learning worker). The AI proposes outcomes;
   * support impact comes from what the learner was actually shown (hints, guided mode, self-repair).
   */
  interpretWriting(result: AiResult, submissionId: string, opportunityOverride?: Opportunity): ObservationDraft[] {
    const sub = this.store.db.prepare('SELECT attempt_id, kind, content FROM submissions WHERE submission_id = ?').get(submissionId) as { attempt_id: string; kind: 'original' | 'repair'; content: string } | undefined;
    if (!sub) return [];
    const attempt = this.store.learning.getAttempt(sub.attempt_id);
    if (!attempt) return [];
    const loop = this.store.db.prepare('SELECT unlocked_hint_level FROM writing_loop_states WHERE attempt_id = ?').get(sub.attempt_id) as { unlocked_hint_level: number } | undefined;
    const supportImpact = sub.kind === 'repair' || (loop?.unlocked_hint_level ?? 0) > 0 || attempt.mode === 'guided' ? 'affected' : 'no_related_effect_detected';
    const allowed = this.itemMeta(attempt.item.id, attempt.item.version)?.competencies ?? [SYNTHETIC_COMPETENCY_ID];
    if (isWritingAssessment(result)) return observationsFromResult(result, { submission_id: submissionId, allowed, support_impact: supportImpact });
    const opportunity: Opportunity = opportunityOverride ?? (sub.content.includes('[SYNTHETIC_NO_OPPORTUNITY]') ? 'absent' : 'observed');
    return observationsFromLegacy(result as Assessment, { submission_id: submissionId, primary: SYNTHETIC_COMPETENCY_ID, secondary: SYNTHETIC_SECONDARY_COMPETENCY_ID,
      opportunity, regression: sub.content.includes('[SYNTHETIC_CC_REGRESSION]'), support_impact: supportImpact });
  }

  /** Learning worker hook: observations for a claimed learner job. */
  interpretJob(result: AiResult, jobId: string): ObservationDraft[] {
    const job = this.store.queue.get(jobId);
    return job ? this.interpretWriting(result, job.submission_id) : [];
  }

  /**
   * Bước 4–5 after the assessment committed: diagnosis, error ledger, loop step and verification chain. Idempotent;
   * does nothing until the job is COMPLETED. A real (non-synthetic) result supplies its own diagnosis and hints,
   * which are stored only after the disclosure check; synthetic runs keep the fixture diagnosis.
   */
  finalizeAssessment(submissionId: string): boolean {
    return this.store.uow.run(() => {
      if (this.store.db.prepare('SELECT 1 FROM writing_diagnoses WHERE submission_id = ?').get(submissionId)) return false;
      const submission = this.store.db.prepare('SELECT submission_id, attempt_id, kind, evidence_source_id FROM submissions WHERE submission_id = ?').get(submissionId) as
        { submission_id: string; attempt_id: string; kind: 'original' | 'repair'; evidence_source_id: string } | undefined;
      if (!submission) return false;
      const job = this.store.db.prepare('SELECT job_id, state FROM ai_jobs WHERE submission_id = ? ORDER BY created_at DESC LIMIT 1').get(submissionId) as { job_id: string; state: string } | undefined;
      if (!job || job.state !== 'COMPLETED') return false;
      const attempt = this.store.learning.getAttempt(submission.attempt_id)!;
      const input = { attempt_id: submission.attempt_id };
      const isRepair = submission.kind === 'repair';
      const result = this.store.queue.result(job.job_id);
      const provider = this.store.queue.runs(job.job_id).find((r) => r.state === 'COMPLETED')?.provider ?? 'fake';
      const real = isWritingAssessment(result) && result.synthetic === false && provider !== 'fake';

      const loopOutcome = () => {
        const row = this.store.db.prepare('SELECT outcome, opportunity FROM observations WHERE submission_id = ? AND competency_id = ?')
          .get(submission.submission_id, this.loopCompetency(submission.attempt_id)) as { outcome: Outcome; opportunity: Opportunity } | undefined;
        return { outcome: row?.outcome ?? 'inconclusive' as Outcome, opportunity: row?.opportunity ?? 'unknown' as Opportunity };
      };
      if (real) {
        this.finalizeReal(result, { job_id: job.job_id, submission_id: submission.submission_id, evidence_source_id: submission.evidence_source_id, attempt_id: submission.attempt_id, mode: attempt.mode, purpose: attempt.purpose, item_id: attempt.item.id });
        if (!isRepair) this.retargetLoop(submission.attempt_id, submission.submission_id);
        const r = loopOutcome();
        this.advanceLoop(attempt.attempt_id, attempt.purpose, submission.submission_id, r.outcome, r.opportunity, isRepair);
        return true;
      }
      const { outcome, opportunity } = loopOutcome();

      // Kiểm duyệt chính sách tiết lộ trước khi lưu gói gợi mở sinh sẵn ở server (04 §2.D, 06A §7.C.3).
      const disclosureCheck = verifyHintDisclosurePolicy(DEFAULT_PREGENERATED_HINTS);
      if (!disclosureCheck.ok) {
        throw new Error(`Pre-generated hints failed disclosure policy: ${[...new Set(disclosureCheck.reasons.map((r) => r.split(':')[0]))].join(', ')}`);
      }

      const priorityIssues: PriorityIssue[] = outcome === 'met'
        ? []
        : [
            {
              issue_id: 'iss-tr-position',
              competency_id: SYNTHETIC_COMPETENCY_ID,
              location: 'Đoạn mở bài & câu chủ đề đoạn 2',
              symptom: 'Hai đoạn thân bài đưa ra kết luận trái ngược nhau mà thiếu mệnh đề nhượng bộ kết nối lập trường.',
              hypothesis: 'Người học liệt kê ý rời rạc theo từng đoạn thay vì duy trì lập trường xuyên suốt (Task Response).',
              hypothesis_status: this.hypothesisStatusFor(input.attempt_id),
              expected_verification: 'Sửa lại câu chủ đề bằng mệnh đề nhượng bộ (Bước 5) và tự viết bài mới không gợi ý ở Bước 7A.',
            },
          ];

      // D5: 2–3 focuses per session, 1 for whole-task / complex work; the rest stays visible as other issues.
      const limit = this.policy ? focusLimit(attempt.purpose === '7B' || attempt.purpose === '9' || attempt.mode === 'exam', this.policy.params) : priorityIssues.length;
      const overflow = priorityIssues.splice(limit);
      const otherIssues = outcome === 'met'
        ? []
        : [
            'Một số cụm từ lặp lại ở đoạn kết (đã gác lại theo nguyên tắc chỉ ưu tiên 1–2 điểm trọng tâm mỗi lượt).',
            ...overflow.map((i) => i.symptom),
          ];

      const at = this.store.now().toISOString();
      this.store.db.prepare(`INSERT INTO writing_diagnoses (diagnosis_id, attempt_id, submission_id, job_id, priority_issues_json, other_issues_json, hints_json, disclosure_checked, synthetic, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`).run(
        randomUUID(), input.attempt_id, submission.submission_id, job.job_id,
        canonicalJson(priorityIssues), canonicalJson(otherIssues), canonicalJson(DEFAULT_PREGENERATED_HINTS), at,
      );

      // Cập nhật hoặc ghi nhận giả thuyết vào Sổ cái lỗi (error_hypotheses).
      const existingHyp = this.store.db.prepare('SELECT hypothesis_id FROM error_hypotheses WHERE attempt_id = ? AND competency_id = ?')
        .get(input.attempt_id, SYNTHETIC_COMPETENCY_ID) as { hypothesis_id: string } | undefined;
      if (!existingHyp && outcome === 'not_met') {
        this.store.db.prepare(`INSERT INTO error_hypotheses (hypothesis_id, competency_id, evidence_source_id, attempt_id, symptom, hypothesis, status, verification_note, synthetic, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'initial', ?, 1, ?, ?)`).run(
          randomUUID(), SYNTHETIC_COMPETENCY_ID, submission.evidence_source_id, input.attempt_id,
          'Lập trường giữa mở bài và thân bài tự mâu thuẫn.',
          'Thiếu khung nhượng bộ để dung hòa hai quan điểm trong bài Discussion + Opinion.',
          'Giả thuyết ban đầu từ bài nộp gốc (synthetic); cần kiểm chứng qua Bước 5 và 7A.',
          at, at,
        );
      }

      this.advanceLoop(attempt.attempt_id, attempt.purpose, submission.submission_id, outcome, opportunity, isRepair);
      return true;
    });
  }

  /** Loop step, verification chain (C) and error ledger (E) after an assessment, for both synthetic and real results. */
  private advanceLoop(attemptId: string, purpose: Purpose, submissionId: string, outcome: Outcome, opportunity: Opportunity, isRepair: boolean): void {
    const at = this.store.now().toISOString();
    if (purpose === '7A' || purpose === '7B' || purpose === '9') {
      this.applyVerificationStep8And9(attemptId, purpose, submissionId, outcome, opportunity, at);
    } else {
      const nextStep = outcome === 'met' ? 6 : 5;
      this.store.db.prepare('UPDATE writing_loop_states SET step = ?, updated_at = ? WHERE attempt_id = ?').run(nextStep, at, attemptId);
      if (!isRepair) this.integratedStep9(attemptId, this.loopCompetency(attemptId), outcome, opportunity, at);
    }
    for (const c of this.competencyDefs()) this.refreshHypotheses(c.competency_id, at);
  }

  /**
   * E-49: an AI-authored prompt measures many framework competencies; after the first real diagnosis the loop focuses
   * on the first priority issue the assessor judged not met (the AI proposes the issue, the observation decides).
   * Synthetic items keep their fixed loop competency.
   */
  private retargetLoop(attemptId: string, submissionId: string): void {
    const attempt = this.store.learning.getAttempt(attemptId);
    if (!attempt || this.itemMeta(attempt.item.id, attempt.item.version)?.synthetic !== false) return;
    const diag = this.store.db.prepare('SELECT priority_issues_json FROM writing_diagnoses WHERE submission_id = ?').get(submissionId) as { priority_issues_json: string } | undefined;
    const issues = diag ? JSON.parse(diag.priority_issues_json) as PriorityIssue[] : [];
    const notMet = new Set((this.store.db.prepare("SELECT competency_id FROM observations WHERE submission_id = ? AND outcome = 'not_met'").all(submissionId) as { competency_id: string }[]).map((r) => r.competency_id));
    const target = issues.find((i) => notMet.has(i.competency_id))?.competency_id ?? [...notMet][0];
    if (target) this.store.db.prepare('UPDATE writing_loop_states SET competency_id = ?, updated_at = ? WHERE attempt_id = ?').run(target, this.store.now().toISOString(), attemptId);
  }

  /** Diagnosis and ledger entries proposed by a real assessor, after the application's checks (P5-5). */
  private finalizeReal(result: AiResult, ctx: { job_id: string; submission_id: string; evidence_source_id: string; attempt_id: string; mode: Mode; purpose: Purpose; item_id: string }): void {
    if (!isWritingAssessment(result)) return;
    const allowed = this.itemMeta(ctx.item_id)?.competencies ?? [SYNTHETIC_COMPETENCY_ID];
    const complex = ctx.purpose === '7B' || ctx.purpose === '9' || ctx.mode === 'exam';
    const limit = this.policy ? focusLimit(complex, this.policy.params) : 3;
    const d = diagnosisFromResult(result, { allowed, focus_limit: limit });
    const at = this.store.now().toISOString();
    const outcomes = new Map((this.store.db.prepare('SELECT competency_id, outcome FROM observations WHERE submission_id = ?').all(ctx.submission_id) as { competency_id: string; outcome: Outcome }[])
      .map((o) => [o.competency_id, o.outcome]));
    const priority: PriorityIssue[] = d.priority_issues.map((i) => ({ issue_id: i.issue_id, competency_id: i.competency_id, location: i.location, symptom: i.symptom, hypothesis: i.hypothesis,
      hypothesis_status: this.hypothesisStatusFor(ctx.attempt_id), expected_verification: i.expected_verification, impact: i.impact, certainty: i.certainty }));
    const notes = d.disclosure.ok ? [] : [`Gợi ý theo nấc bị loại vì không qua kiểm tra tiết lộ (${[...new Set(d.disclosure.reasons.map((r) => r.split(':')[0]))].join(', ')}).`];
    this.store.db.prepare(`INSERT INTO writing_diagnoses (diagnosis_id, attempt_id, submission_id, job_id, priority_issues_json, other_issues_json, hints_json, disclosure_checked, synthetic, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`).run(randomUUID(), ctx.attempt_id, ctx.submission_id, ctx.job_id, canonicalJson(priority), canonicalJson([...d.other_issues, ...notes]),
      canonicalJson(d.hints), d.hints ? 1 : 0, at);
    // E0: one initial hypothesis per competency with a not_met priority issue in this attempt (the AI proposes, E decides later).
    for (const i of d.priority_issues) {
      if (outcomes.get(i.competency_id) !== 'not_met') continue;
      if (this.store.db.prepare('SELECT 1 FROM error_hypotheses WHERE attempt_id = ? AND competency_id = ?').get(ctx.attempt_id, i.competency_id)) continue;
      this.store.db.prepare(`INSERT INTO error_hypotheses (hypothesis_id, competency_id, evidence_source_id, attempt_id, symptom, hypothesis, status, verification_note, synthetic, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'initial', ?, 0, ?, ?)`).run(randomUUID(), i.competency_id, ctx.evidence_source_id, ctx.attempt_id, i.symptom, i.hypothesis,
        'Giả thuyết ban đầu do AI đề xuất; cần kiểm chứng qua tự sửa và bài mới không gợi ý.', at, at);
    }
  }

  /**
   * Bước 8 & Bước 9: Cập nhật có điều kiện và lập lịch 7B / 9 sau khi hoàn thành 7A / 7B / 9 (01 Bước 7–9, 02 §3).
   * Mọi kết quả từ FakeAdapter đều giữ `synthetic: true` và không bao giờ nâng trạng thái năng lực thật.
   */
  private applyVerificationStep8And9(attemptId: string, purpose: Purpose, submissionId: string, outcome: Outcome, opportunity: Opportunity, at: string): void {
    const loop = this.store.db.prepare('SELECT origin_attempt_id, competency_id FROM writing_loop_states WHERE attempt_id = ?')
      .get(attemptId) as { origin_attempt_id: string | null; competency_id: string } | undefined;
    const compId = loop?.competency_id ?? SYNTHETIC_COMPETENCY_ID;

    // Kiểm tra xem tiêu chí phụ có bị tụt không (regression check ở 7A/7B): tụt tiêu chí khác thì chưa công nhận bước này.
    const secondaryObs = this.store.db.prepare('SELECT outcome FROM observations WHERE submission_id = ? AND competency_id = ?')
      .get(submissionId, SYNTHETIC_SECONDARY_COMPETENCY_ID) as { outcome: Outcome } | undefined;
    const regressed = secondaryObs?.outcome === 'not_met';
    this.store.db.prepare('UPDATE writing_loop_states SET step = ?, updated_at = ? WHERE attempt_id = ?').run(purpose === '9' ? 9 : 8, at, attemptId);

    const task = this.store.db.prepare('SELECT task_id, step9_index, synthetic FROM scheduled_tasks WHERE assigned_attempt_id = ? ORDER BY updated_at DESC LIMIT 1')
      .get(attemptId) as { task_id: string; step9_index: number | null; synthetic: number } | undefined;
    if (!this.policy) {
      // Không có chính sách được duyệt: chỉ đóng nhiệm vụ, không tự xếp lịch mới.
      this.store.db.prepare(`UPDATE scheduled_tasks SET state = ?, updated_at = ? WHERE assigned_attempt_id = ?`).run(opportunity === 'absent' ? 'AWAITING_OPPORTUNITY' : 'COMPLETED', at, attemptId);
      return;
    }
    // D-02 C: the chain only advances on independent evidence (A/B definitions). Synthetic flow tasks stay synthetic.
    const record = this.evidenceRecords(compId).find((r) => r.attempt_id === attemptId && r.kind === 'original');
    const result = afterVerification({
      purpose: purpose as '7A' | '7B' | '9',
      independent: record ? isIndependent(record) : false,
      outcome: regressed && outcome === 'met' ? 'not_met' : outcome,
      opportunity,
      step9_index: task?.step9_index ?? 0,
    }, this.policy.params);

    if (result.awaiting_opportunity) {
      this.store.db.prepare("UPDATE scheduled_tasks SET state = 'AWAITING_OPPORTUNITY', absent_count = absent_count + ?, updated_at = ? WHERE assigned_attempt_id = ?")
        .run(opportunity === 'absent' ? 1 : 0, at, attemptId);
      if (task) this.maybeDirectCheck(task.task_id, at);
    } else {
      this.store.db.prepare("UPDATE scheduled_tasks SET state = 'COMPLETED', updated_at = ? WHERE assigned_attempt_id = ?").run(at, attemptId);
    }
    const synthetic = task ? task.synthetic === 1 : (record?.synthetic ?? true);
    if (result.schedule) this.scheduleVerification(compId, loop?.origin_attempt_id ?? attemptId, result.schedule, synthetic, at);
    if (result.back_to_step6 && loop?.origin_attempt_id) {
      // C3: 7A chưa đạt → quay về củng cố Bước 6 của vòng gốc (không ép làm lại 7A ngay đầu buổi).
      this.store.db.prepare('UPDATE writing_loop_states SET step = 6, step6_completed = 0, updated_at = ? WHERE attempt_id = ?').run(at, loop.origin_attempt_id);
    }
  }

  // ---- Bước 5: Mở từng nấc gợi mở (P3-3) -------------------------------------------------------
  /**
   * Mở đúng nấc gợi mở tiếp theo (1 -> 2 -> 3) và ghi nhận assistance_event idempotent (01 Bước 5, 06 §2.3).
   * Không bao giờ kích hoạt AI chấm lại khi chỉ mở gợi mở; chỉ trả về các nấc <= unlocked_level.
   */
  unlockHint(attemptId: string, level: 1 | 2 | 3, requestKey: string, currentDraftText = ''): AttemptWorkspaceView {
    const attempt = this.store.learning.getAttempt(attemptId);
    if (!attempt) throw Object.assign(new Error('Unknown attempt'), { statusCode: 404 });
    if (attempt.mode === 'exam') {
      throw Object.assign(new Error('Hints are disabled in exam mode'), { statusCode: 403, code: 'EXAM_MODE_NO_HINTS' });
    }
    if (attempt.purpose === '7A' || attempt.purpose === '7B' || attempt.purpose === '9') {
      throw Object.assign(new Error('Verification tasks do not allow scaffolded hints'), { statusCode: 403, code: 'VERIFICATION_NO_HINTS' });
    }

    const latestSub = this.store.db.prepare('SELECT submission_id FROM submissions WHERE attempt_id = ? ORDER BY revision DESC LIMIT 1')
      .get(attemptId) as { submission_id: string } | undefined;
    if (!latestSub) {
      throw Object.assign(new Error('Submit your original attempt before unlocking repair hints'), { statusCode: 400, code: 'NO_SUBMISSION_FOR_HINT' });
    }

    const diag = this.store.db.prepare('SELECT hints_json FROM writing_diagnoses WHERE submission_id = ?')
      .get(latestSub.submission_id) as { hints_json: string } | undefined;
    if (!diag) throw Object.assign(new Error('No diagnosis available for this attempt'), { statusCode: 404 });
    const bundle = JSON.parse(diag.hints_json) as PreGeneratedHints | null;
    if (!bundle) throw Object.assign(new Error('No checked hint levels for this diagnosis'), { statusCode: 409, code: 'HINTS_UNAVAILABLE' });

    const policyCheck = verifyHintDisclosurePolicy(bundle);
    if (!policyCheck.ok) {
      throw Object.assign(new Error(`Hint bundle failed disclosure check: ${[...new Set(policyCheck.reasons.map((r) => r.split(':')[0]))].join(', ')}`), { statusCode: 500 });
    }

    this.store.uow.run(() => {
      const loop = this.store.db.prepare('SELECT unlocked_hint_level FROM writing_loop_states WHERE attempt_id = ?')
        .get(attemptId) as { unlocked_hint_level: number } | undefined;
      const currentLevel = loop?.unlocked_hint_level ?? 0;

      // Không cho nhảy cóc từ 0 lên 2 mà chưa mở 1 (trừ khi chọn "Giải thích trực tiếp" qua chooseRepairAction).
      if (level > currentLevel + 1) {
        throw Object.assign(new Error(`Must unlock hint level ${currentLevel + 1} before level ${level}`), { statusCode: 400, code: 'HINT_LEVEL_OUT_OF_ORDER' });
      }

      const hintContent = level === 1 ? bundle.level_1 : level === 2 ? bundle.level_2 : bundle.level_3;
      const preSnap = this.store.learning.saveSnapshot(attemptId, 'pre_assistance', currentDraftText);

      // Idempotent theo attempt + submission + hint_level để mở lại cùng nấc không ghi trùng sự kiện hỗ trợ.
      const rec = this.store.learning.recordAssistance({
        idempotency_key: `hint:${attemptId}:${latestSub.submission_id}:L${level}:${requestKey}`,
        attempt_id: attemptId,
        submission_id: latestSub.submission_id,
        hint_level: level,
        content: hintContent,
        impacts: [{ competency_id: this.loopCompetency(attemptId), impact: 'affected', reduced_load: level >= 2 }],
        pre_snapshot_id: preSnap.snapshot_id,
        post_snapshot_id: null,
      });

      // Nếu là nấc 3 (có mẫu sửa & giải thích), ghi nhận thêm exposure ở mức explanation/sample.
      if (level === 3 && rec.created) {
        const servable = this.store.knowledge.servableItem(attempt.item.id, attempt.item.version, 'learner');
        if (servable.ok) {
          this.store.learning.recordExposure({
            idempotency_key: `learner:hint3:${attemptId}`,
            item: { id: attempt.item.id, version: attempt.item.version, hash: attempt.item.hash },
            item_family_id: servable.item_family_id,
            shared_stimulus_id: servable.shared_stimulus_id,
            surface: 'learner',
            scope: 'learner',
            level: 'explanation',
          });
        }
      }

      const nextUnlocked = Math.max(currentLevel, level);
      this.store.db.prepare('UPDATE writing_loop_states SET unlocked_hint_level = ?, updated_at = ? WHERE attempt_id = ?')
        .run(nextUnlocked, this.store.now().toISOString(), attemptId);
    });

    return this.getWorkspaceView(attemptId);
  }

  /**
   * Bước 5: Người học chọn "Để mình thử thêm" (try_more), "Giải thích trực tiếp" (direct_explanation),
   * hoặc hỏi làm rõ câu hỏi (clarify — không tính là một lần tự sửa thất bại và không gọi AI chấm lại).
   */
  recordStep5Interaction(attemptId: string, action: 'try_more' | 'direct_explanation' | 'clarify', requestKey: string, currentDraftText = ''): AttemptWorkspaceView {
    const attempt = this.store.learning.getAttempt(attemptId);
    if (!attempt) throw Object.assign(new Error('Unknown attempt'), { statusCode: 404 });

    if (action === 'clarify') {
      this.store.db.prepare('UPDATE writing_loop_states SET clarification_count = clarification_count + 1, updated_at = ? WHERE attempt_id = ?')
        .run(this.store.now().toISOString(), attemptId);
      return this.getWorkspaceView(attemptId);
    }

    if (action === 'try_more') {
      this.store.db.prepare("UPDATE writing_loop_states SET learner_choice = 'try_more', updated_at = ? WHERE attempt_id = ?")
        .run(this.store.now().toISOString(), attemptId);
      return this.getWorkspaceView(attemptId);
    }

    // Chọn "Giải thích trực tiếp": mở tới Nấc 3 và ghi nhận assistance_event cho các nấc được mở.
    const latestSub = this.store.db.prepare('SELECT submission_id FROM submissions WHERE attempt_id = ? ORDER BY revision DESC LIMIT 1')
      .get(attemptId) as { submission_id: string } | undefined;
    if (!latestSub) throw Object.assign(new Error('No submission found'), { statusCode: 400 });
    const diag = this.store.db.prepare('SELECT hints_json FROM writing_diagnoses WHERE submission_id = ?')
      .get(latestSub.submission_id) as { hints_json: string } | undefined;
    const bundle = diag ? JSON.parse(diag.hints_json) as PreGeneratedHints | null : null;
    if (!bundle) throw Object.assign(new Error('No checked hint levels for this diagnosis'), { statusCode: 409, code: 'HINTS_UNAVAILABLE' });

    this.store.uow.run(() => {
      const preSnap = this.store.learning.saveSnapshot(attemptId, 'pre_assistance', currentDraftText);
      this.store.learning.recordAssistance({
        idempotency_key: `direct-explanation:${attemptId}:${latestSub.submission_id}:${requestKey}`,
        attempt_id: attemptId,
        submission_id: latestSub.submission_id,
        hint_level: 3,
        content: bundle.level_3,
        impacts: [{ competency_id: this.loopCompetency(attemptId), impact: 'affected', reduced_load: true }],
        pre_snapshot_id: preSnap.snapshot_id,
        post_snapshot_id: null,
      });
      this.store.db.prepare("UPDATE writing_loop_states SET learner_choice = 'direct_explanation', unlocked_hint_level = 3, updated_at = ? WHERE attempt_id = ?")
        .run(this.store.now().toISOString(), attemptId);
    });

    return this.getWorkspaceView(attemptId);
  }

  /** Checked hints of the latest real diagnosis of this attempt (null when none passed the disclosure check). */
  private aiStep6Hints(attemptId: string): PreGeneratedHints | null {
    const row = this.store.db.prepare("SELECT hints_json FROM writing_diagnoses WHERE attempt_id = ? AND synthetic = 0 AND hints_json <> 'null' ORDER BY created_at DESC LIMIT 1").get(attemptId) as { hints_json: string } | undefined;
    return row ? JSON.parse(row.hints_json) as PreGeneratedHints : null;
  }

  /**
   * E-50 Bước 6 on an AI-authored prompt. Free-text answers are not graded by string matching (04: matching does not
   * recognise understanding), and Bước 6 produces no evidence: it only gates 7A. So the learner answers, then sees the
   * key idea once and judges the match themself; 7A (a novel task, no hints) is what verifies.
   */
  private completeAiStep6(attemptId: string, selfCheck: boolean | undefined): AttemptWorkspaceView {
    const hints = this.aiStep6Hints(attemptId);
    if (!hints) throw Object.assign(new Error('Chưa có chẩn đoán thật kèm giải thích cho bài này'), { statusCode: 409, code: 'STEP6_NOT_READY' });
    if (selfCheck === undefined) {
      const view = this.getWorkspaceView(attemptId);
      return { ...view, loop: view.loop ? { ...view.loop, step6_expected: hints.concept_check_expected } : null };
    }
    this.store.uow.run(() => {
      this.store.db.prepare(`UPDATE writing_loop_states SET concept_check_passed = ?, step6_branch = COALESCE(step6_branch, 'micro_lesson'), step6_completed = ?, step = CASE WHEN ? = 1 THEN 7 ELSE 6 END, updated_at = ? WHERE attempt_id = ?`)
        .run(selfCheck ? 1 : 0, selfCheck ? 1 : 0, selfCheck ? 1 : 0, this.store.now().toISOString(), attemptId);
    });
    return this.getWorkspaceView(attemptId);
  }

  // ---- Bước 6: Concept-check & Bổ sung kiến thức mục tiêu (01 Bước 5–6) ------------------------
  completeStep6(attemptId: string, conceptCheckAnswer: string, selfCheck?: boolean): AttemptWorkspaceView {
    const attempt = this.store.learning.getAttempt(attemptId);
    if (!attempt) throw Object.assign(new Error('Unknown attempt'), { statusCode: 404 });
    if (!conceptCheckAnswer.trim()) {
      throw Object.assign(new Error('Concept check answer is required'), { statusCode: 400, code: 'EMPTY_CONCEPT_CHECK' });
    }
    if (this.itemMeta(attempt.item.id, attempt.item.version)?.synthetic === false) return this.completeAiStep6(attemptId, selfCheck);

    const passed = conceptCheckAnswer.toLowerCase().includes('nhượng bộ')
      || conceptCheckAnswer.toLowerCase().includes('lập trường')
      || conceptCheckAnswer.toLowerCase().includes('mâu thuẫn')
      || conceptCheckAnswer.toLowerCase().includes('concession')
      || conceptCheckAnswer.toLowerCase().includes('position');

    this.store.uow.run(() => {
      const view = this.getWorkspaceView(attemptId);
      const branch = view.loop?.step6_branch ?? 'micro_lesson';
      const at = this.store.now().toISOString();
      this.store.db.prepare(`UPDATE writing_loop_states SET concept_check_passed = ?, step6_branch = ?, step6_completed = ?, step = CASE WHEN ? = 1 THEN 7 ELSE 6 END, updated_at = ? WHERE attempt_id = ?`)
        .run(passed ? 1 : 0, branch, passed ? 1 : 0, passed ? 1 : 0, at, attemptId);
    });

    return this.getWorkspaceView(attemptId);
  }

  // ---- Bước 7A: Chuyển sang nhiệm vụ mới trong ngữ cảnh sạch (01 Bước 7A, 04 §2.B) -------------
  /**
   * Tạo một attempt mới ở chế độ `self_practice`, `purpose: '7A'` trên đề bài mới chưa lộ đáp án.
   * Ngữ cảnh và HTTP response của 7A hoàn toàn sạch: không chứa gợi mở, lời giải mẫu hay mục tiêu ẩn của bài cũ.
   */
  startStep7A(originAttemptId: string, requestKey: string): AttemptWorkspaceView {
    this.ensureSyntheticWritingCatalog();
    const origin = this.store.learning.getAttempt(originAttemptId);
    if (!origin) throw Object.assign(new Error('Unknown origin attempt'), { statusCode: 404 });
    const originMeta = this.itemMeta(origin.item.id, origin.item.version);

    const loop = this.store.db.prepare('SELECT step6_completed, linked_7a_attempt_id, competency_id FROM writing_loop_states WHERE attempt_id = ?')
      .get(originAttemptId) as { step6_completed: number; linked_7a_attempt_id: string | null; competency_id: string } | undefined;
    if (!loop || loop.step6_completed !== 1) {
      throw Object.assign(new Error('Complete Step 6 before starting Step 7A verification'), { statusCode: 409, code: 'STEP6_NOT_COMPLETED' });
    }
    if (loop.linked_7a_attempt_id) {
      return this.getWorkspaceView(loop.linked_7a_attempt_id);
    }

    // E-50: a loop on an AI-authored prompt verifies with a novel AI paragraph task for the same competency.
    const aiTarget = originMeta?.synthetic === false ? this.pickVerificationItem(loop.competency_id, 'short') : undefined;
    if (originMeta?.synthetic === false && !aiTarget) {
      this.store.uow.run(() => this.verificationGap(loop.competency_id, '7A', this.store.now().toISOString()));
      throw Object.assign(new Error(`Chưa có đề đoạn chưa xem cho ${loop.competency_id}. Soạn thêm: npm.cmd run author -- items --paragraph --focus ${loop.competency_id}`), { statusCode: 409, code: 'NO_ELIGIBLE_7A_TASK' });
    }
    const target = aiTarget
      ? { id: aiTarget.id, version: aiTarget.version, rubric: aiTarget.rubric, package: aiTarget.package, minutes: aiTarget.estimated_minutes, synthetic: 0 }
      : { id: SYNTHETIC_ITEM_7A_ID, version: 'v1', rubric: { id: origin.rubric.id, version: origin.rubric.version }, package: { id: SYNTHETIC_WRITING_PKG_ID, version: 'v1' }, minutes: 20, synthetic: 1 };

    // Kiểm tra điều kiện đủ của bài 7A qua bộ lọc điều phối Stage 1 (filterEligible).
    const servable = this.store.knowledge.servableItem(target.id, target.version, 'learner');
    if (!servable.ok) throw Object.assign(new Error(`7A item not servable: ${servable.reason}`), { statusCode: 409 });

    const candidate: TaskCandidate = {
      task_id: `7a-for-${originAttemptId}`,
      item: { id: target.id, version: target.version, item_family_id: servable.item_family_id, shared_stimulus_id: servable.shared_stimulus_id, derived_from: [] },
      package: { id: target.package.id, version: target.package.version, release_state: 'active' },
      competency_ids: [loop.competency_id],
      purpose: '7A',
      mode: 'self_practice',
      estimated_minutes: target.minutes,
      meets_min_scope: true,
      quality_gate_passed: true,
      resources_available: true,
    };
    const eligibility = filterEligible([candidate], { competency_ids: [loop.competency_id], available_minutes: 60 }, this.store.learning.exposures(), this.store.knowledge.revocations());
    if (eligibility.eligible.length === 0) {
      throw Object.assign(new Error(`No qualifying novel 7A task available: ${eligibility.rejected[0]?.reasons.join(', ')}`), { statusCode: 409, code: 'NO_ELIGIBLE_7A_TASK' });
    }

    const transferAttempt = this.store.uow.run(() => {
      const created = this.store.learning.createAttempt({
        request_key: requestKey,
        scope: 'learner',
        item: { id: target.id, version: target.version },
        rubric: target.rubric,
        mode: 'self_practice',
        purpose: '7A',
      });

      this.store.learning.recordExposure({
        idempotency_key: `learner:prompt:${created.attempt_id}`,
        item: { id: target.id, version: target.version, hash: created.item.hash },
        item_family_id: servable.item_family_id,
        shared_stimulus_id: servable.shared_stimulus_id,
        surface: 'learner',
        scope: 'learner',
        level: 'prompt',
      });

      const at = this.store.now().toISOString();
      this.store.db.prepare(`INSERT INTO writing_loop_states (attempt_id, origin_attempt_id, competency_id, step, unlocked_hint_level, synthetic, updated_at)
        VALUES (?, ?, ?, 7, 0, ?, ?)`).run(created.attempt_id, originAttemptId, loop.competency_id, target.synthetic, at);
      this.store.db.prepare('UPDATE writing_loop_states SET linked_7a_attempt_id = ?, step = 7, updated_at = ? WHERE attempt_id = ?')
        .run(created.attempt_id, at, originAttemptId);
      if (origin.state === 'SUBMITTED' || origin.state === 'REPAIRING') {
        this.store.learning.setAttemptState(originAttemptId, 'AWAITING_VERIFICATION');
      }
      return created;
    });

    return this.getWorkspaceView(transferAttempt.attempt_id);
  }

  // ---- Truy vấn Workspace làm bài (cắt quyền trước khi trả về client) --------------------------
  getWorkspaceView(attemptId: string): AttemptWorkspaceView {
    this.ensureSyntheticWritingCatalog();
    const attempt = this.store.learning.getAttempt(attemptId);
    if (!attempt) throw Object.assign(new Error('Unknown attempt'), { statusCode: 404, code: 'UNKNOWN_ATTEMPT' });
    // P5-5: a job finished by the learning worker is finalised on the next read (idempotent).
    const pendingSub = this.store.db.prepare(`SELECT s.submission_id FROM submissions s WHERE s.attempt_id = ? AND NOT EXISTS (SELECT 1 FROM writing_diagnoses d WHERE d.submission_id = s.submission_id)
      ORDER BY s.revision DESC LIMIT 1`).get(attemptId) as { submission_id: string } | undefined;
    if (pendingSub) this.finalizeAssessment(pendingSub.submission_id);

    type ItemView = { title: string; prompt: string; skill: 'writing' | 'speaking_text'; genre: string; min_words: number;
      recommended_minutes: number; criteria_summary: string[]; outline_suggestions?: string[]; vocabulary_frame?: string[] };
    const meta = this.itemMeta(attempt.item.id, attempt.item.version);
    // E-49: an AI-authored item is a knowledge unit; the learner view is built from its prompt and the criteria titles.
    const itemObj: ItemView = meta && !meta.synthetic
      ? { title: meta.title, prompt: meta.prompt, skill: meta.skill, genre: meta.genre, min_words: meta.min_words, recommended_minutes: meta.estimated_minutes,
        criteria_summary: meta.skill === 'speaking_text'
          ? ['Fluency and Coherence (phần thể hiện trên văn bản)', 'Lexical Resource', 'Grammatical Range and Accuracy', 'Không chấm phát âm (E-43)']
          : ['Task Response', 'Coherence and Cohesion', 'Lexical Resource', 'Grammatical Range and Accuracy'] }
      : this.store.json.get('item', attempt.item.id, attempt.item.version, attempt.item.hash) as ItemView;
    const loopCompetencyId = this.loopCompetency(attemptId);

    const latestSnap = this.store.db.prepare(`SELECT snapshot_version, content, created_at FROM snapshots
      WHERE attempt_id = ? ORDER BY snapshot_version DESC LIMIT 1`).get(attemptId) as { snapshot_version: number; content: string; created_at: string } | undefined;

    const subRows = this.store.db.prepare(`SELECT submission_id, revision, kind, repair_attempt_index, content, created_at
      FROM submissions WHERE attempt_id = ? ORDER BY revision ASC`).all(attemptId) as {
      submission_id: string; revision: number; kind: 'original' | 'repair'; repair_attempt_index: number; content: string; created_at: string;
    }[];

    const submissions = subRows.map((s) => {
      const obs = this.store.db.prepare('SELECT outcome, ai_run_id FROM observations WHERE submission_id = ? AND competency_id = ?')
        .get(s.submission_id, loopCompetencyId) as { outcome: Outcome; ai_run_id: string } | undefined;
      return {
        ...s,
        outcome: obs?.outcome ?? null,
        // Synthetic unless a real provider assessed it (P5-5).
        synthetic: obs ? this.providerOf(obs.ai_run_id) === 'fake' : this.aiMode !== 'real',
      };
    });

    const loopRow = this.store.db.prepare('SELECT * FROM writing_loop_states WHERE attempt_id = ?').get(attemptId) as {
      attempt_id: string; origin_attempt_id: string | null; competency_id: string; step: number; unlocked_hint_level: number;
      learner_choice: 'try_more' | 'direct_explanation' | null; clarification_count: number; concept_check_passed: number | null;
      step6_branch: Step6Branch | null; step6_completed: number; linked_7a_attempt_id: string | null; synthetic: number;
    } | undefined;

    const isVerification = attempt.purpose === '7A' || attempt.purpose === '7B' || attempt.purpose === '9';
    const isExam = attempt.mode === 'exam';

    let diagnosis: DiagnosisView | null = null;
    const latestSub = submissions.at(-1);
    if (latestSub && !isVerification) {
      const diagRow = this.store.db.prepare('SELECT * FROM writing_diagnoses WHERE submission_id = ?').get(latestSub.submission_id) as {
        diagnosis_id: string; submission_id: string; job_id: string; priority_issues_json: string; other_issues_json: string; hints_json: string; synthetic: number;
      } | undefined;
      if (diagRow) {
        const fullHints = JSON.parse(diagRow.hints_json) as PreGeneratedHints | null;
        const unlocked = isExam ? 0 : (loopRow?.unlocked_hint_level ?? 0);
        // Cắt quyền: chỉ trả các nấc đã mở! Không có gói gợi ý hợp lệ (bị loại khi kiểm tra tiết lộ) → không có nấc nào.
        const sliced = fullHints ? sliceUnlockedHints(fullHints, unlocked) : { unlocked_level: 0 as const, hints: [], concept_check_question: null };
        const otherIssues = JSON.parse(diagRow.other_issues_json) as string[];
        diagnosis = {
          diagnosis_id: diagRow.diagnosis_id,
          submission_id: diagRow.submission_id,
          job_id: diagRow.job_id,
          synthetic: diagRow.synthetic === 1,
          priority_issues: JSON.parse(diagRow.priority_issues_json) as PriorityIssue[],
          other_issues_count: otherIssues.length,
          other_issues_summary: otherIssues,
          scaffold: sliced,
        };
      }
    }

    let loop: AttemptWorkspaceView['loop'] = null;
    if (loopRow) {
      const originalSub = submissions.find((s) => s.kind === 'original');
      const repairSubs = submissions.filter((s) => s.kind === 'repair');
      const latestRepair = repairSubs.at(-1);
      const step6Decision = decideStep6Branch({
        original_outcome: originalSub?.outcome ?? 'inconclusive',
        latest_repair_outcome: latestRepair?.outcome ?? null,
        repair_attempts: repairSubs.length,
        unlocked_hint_level: loopRow.unlocked_hint_level,
        learner_choice: loopRow.learner_choice,
        concept_check_passed: loopRow.concept_check_passed === null ? null : loopRow.concept_check_passed === 1,
      });

      // Chỉ nạp nội dung bài học ngắn Bước 6 khi không phải nhiệm vụ kiểm chứng 7A/7B/9 và người học đã bước sang pha sửa/học.
      let step6Lesson: NonNullable<AttemptWorkspaceView['loop']>['step6_lesson'] = null;
      if (!isVerification && !isExam && (loopRow.step >= 6 || step6Decision.ready_for_step6 || loopRow.unlocked_hint_level >= 3 || repairSubs.length >= 1)) {
        const aiHints = meta && !meta.synthetic ? this.aiStep6Hints(attemptId) : null;
        if (aiHints) {
          // E-50: the lesson is the checked level-3 explanation of this attempt's real diagnosis; serving it is an explanation exposure.
          const title = this.competencyDefs().find((c) => c.competency_id === loopRow.competency_id)?.title ?? loopRow.competency_id;
          step6Lesson = { title: `Trọng tâm: ${title}`, explanation: aiHints.level_3, contrast_examples: [], concept_question: aiHints.concept_check_question };
          const servable = this.store.knowledge.servableItem(attempt.item.id, attempt.item.version, 'learner');
          if (servable.ok) {
            this.store.learning.recordExposure({ idempotency_key: `learner:step6:${attemptId}`, item: attempt.item, item_family_id: servable.item_family_id,
              shared_stimulus_id: servable.shared_stimulus_id, surface: 'learner', scope: 'learner', level: 'explanation' });
          }
        } else if (!meta || meta.synthetic) {
          const lessonObj = this.store.json.get('knowledge', SYNTHETIC_MICRO_LESSON_ID, 'v1') as {
            title: string; explanation: string; contrast_examples: string[];
          };
          step6Lesson = {
            title: lessonObj.title,
            explanation: lessonObj.explanation,
            contrast_examples: lessonObj.contrast_examples,
            concept_question: DEFAULT_PREGENERATED_HINTS.concept_check_question,
          };
        }
      }

      loop = {
        origin_attempt_id: loopRow.origin_attempt_id,
        competency_id: loopRow.competency_id,
        step: loopRow.step,
        unlocked_hint_level: (isExam || isVerification ? 0 : loopRow.unlocked_hint_level) as 0 | 1 | 2 | 3,
        learner_choice: loopRow.learner_choice,
        clarification_count: loopRow.clarification_count,
        repair_attempts: repairSubs.length,
        max_guided_repairs: 2,
        offer_direct_explanation: !isVerification && !isExam && step6Decision.offer_direct_explanation,
        concept_check_passed: loopRow.concept_check_passed === null ? null : loopRow.concept_check_passed === 1,
        step6_branch: loopRow.step6_branch ?? step6Decision.branch,
        step6_completed: loopRow.step6_completed === 1,
        step6_lesson: step6Lesson,
        step6_self_check: meta?.synthetic === false,
        linked_7a_attempt_id: loopRow.linked_7a_attempt_id,
        synthetic: loopRow.synthetic === 1,
      };
    }

    const latestNoDiag = latestSub && !this.store.db.prepare('SELECT 1 FROM writing_diagnoses WHERE submission_id = ?').get(latestSub.submission_id) ? latestSub : null;
    const jobRow = latestNoDiag ? this.store.db.prepare('SELECT job_id, state, last_error FROM ai_jobs WHERE submission_id = ? ORDER BY created_at DESC LIMIT 1').get(latestNoDiag.submission_id) as { job_id: string; state: string; last_error: string | null } | undefined : undefined;
    const assessment = latestNoDiag && jobRow && !isVerification ? { submission_id: latestNoDiag.submission_id, job_state: jobRow.state, error: jobRow.last_error, mode: this.aiMode } : null;

    return {
      attempt: {
        attempt_id: attempt.attempt_id,
        mode: attempt.mode,
        purpose: attempt.purpose,
        state: attempt.state,
        item: attempt.item,
        rubric: attempt.rubric,
        created_at: attempt.created_at,
      },
      task_prompt: {
        title: itemObj.title,
        prompt: itemObj.prompt,
        skill: itemObj.skill,
        genre: itemObj.genre,
        min_words: itemObj.min_words,
        recommended_minutes: itemObj.recommended_minutes,
        // Ở chế độ thi (exam) hoặc nhiệm vụ kiểm chứng (7A/7B/9), không gửi khung gợi ý đầu vào xuống client.
        criteria_summary: isExam ? [] : itemObj.criteria_summary,
        input_support: attempt.mode === 'guided' && !isVerification
          ? { outline_suggestions: itemObj.outline_suggestions ?? [], vocabulary_frame: itemObj.vocabulary_frame ?? [] }
          : null,
      },
      draft: {
        latest_text: latestSnap?.content ?? '',
        snapshot_version: latestSnap?.snapshot_version ?? null,
        saved_at: latestSnap?.created_at ?? null,
      },
      submissions,
      loop,
      diagnosis,
      assessment,
    };
  }

  // ---- Tiến độ & Hồ sơ năng lực (02 §2–4, 06 §2.4, D-02) ---------------------------------------
  progressView() {
    this.ensureSyntheticWritingCatalog();
    const competencies = this.competencyDefs();

    const profiles = competencies.map((comp) => this.competencyDetail(comp.competency_id, comp.title, comp.skill, comp.description));

    return {
      policy_status: this.policy ? 'APPROVED' : 'POLICY_NOT_APPROVED',
      policy: this.policy ? { ...this.policy.ref, approved_at: this.policy.params.approved_at, validation_status: this.policy.params.validation_status } : null,
      band_reporting_enabled: false,
      disclaimer: this.policy
        ? `Mức năng lực theo chính sách D-02 ${this.policy.ref.version} (đã duyệt ${this.policy.params.approved_at}, chưa kiểm định thực nghiệm). Chỉ tính bằng chứng thật của bạn: nhận định synthetic (FakeAdapter) không được tính (G0). Báo điểm Band vẫn tắt cho tới khi có bộ đối chứng D-05.`
        : 'Chưa đủ kết luận về mức năng lực hoặc Band (chưa có chính sách D-02 được duyệt). Mọi nhận định từ FakeAdapter đều mang nhãn synthetic và không nâng hồ sơ năng lực thật.',
      data_policy: DATA_POLICY,
      competencies: profiles,
    };
  }

  /** Effective, classified observations of one competency (revocations and supersedes applied, 02 §2.C). */
  private classifiedFor(competencyId: string) {
    const rawObs = this.store.learning.observations(competencyId, 'learner');
    const revoked = this.store.knowledge.revocations();
    // A key/knowledge withdrawal suspends its dependent package too. Do not keep recognising its cached profile evidence.
    for (const o of rawObs) {
      if (!this.store.knowledge.servableItem(o.item.id, o.item.version, 'learner').ok) revoked.push({ target_kind: 'item', target_id: o.item.id, target_version: o.item.version });
    }
    const { effective, excluded } = effectiveObservations(rawObs, revoked);
    const exposures = this.store.learning.exposures();

    const classified: ClassifiedObservation[] = effective.map((o) => {
      const subRow = this.store.db.prepare('SELECT kind, created_at, attempt_id FROM submissions WHERE submission_id = ?')
        .get(o.submission_id) as { kind: 'original' | 'repair'; created_at: string; attempt_id: string };
      const attRow = this.store.db.prepare('SELECT mode, purpose FROM attempts WHERE attempt_id = ?')
        .get(subRow.attempt_id) as { mode: Mode; purpose: Purpose };
      const assistance = this.store.learning.assistanceFor(subRow.attempt_id);
      const servable = this.store.knowledge.servableItem(o.item.id, o.item.version, 'learner');
      // Khi phân loại bằng chứng của chính lượt làm bài đó, chỉ tính các tiếp xúc trước thời điểm nộp bài.
      const priorExposures = exposures.filter((e) => e.item_id !== o.item.id || e.level !== 'prompt');
      const novelty = assessNovelty({
        item_id: o.item.id,
        item_family_id: servable.ok ? servable.item_family_id : 'unknown',
        shared_stimulus_id: servable.ok ? servable.shared_stimulus_id : null,
        derived_from: [],
      }, priorExposures).novelty;

      const attr = classifyEvidence({
        observation: o,
        submission: { kind: subRow.kind, created_at: subRow.created_at },
        attempt: attRow,
        assistance,
        novelty,
      });
      return { observation: o, use: attr.use };
    });
    return { effective, excluded, classified };
  }

  private providerOf(runId: string): string {
    return (this.store.db.prepare('SELECT provider FROM ai_runs WHERE run_id = ?').get(runId) as { provider: string } | undefined)?.provider ?? 'fake';
  }

  /**
   * D-02 v1 evidence records (one per effective observation). Metadata only: never reads submission content.
   * Synthetic = FakeAdapter run or synthetic fixture content; G0 keeps those out of real conclusions.
   */
  evidenceRecords(competencyId: string, classified = this.classifiedFor(competencyId).classified): EvidenceRecord[] {
    const fallbackModality: Modality = /speaking/.test(competencyId) ? 'speaking' : /reading/.test(competencyId) ? 'reading' : /listening/.test(competencyId) ? 'listening' : 'writing';
    return classified.map(({ observation: o, use }) => {
      const sub = this.store.db.prepare('SELECT kind, created_at, attempt_id FROM submissions WHERE submission_id = ?').get(o.submission_id) as { kind: 'original' | 'repair'; created_at: string; attempt_id: string };
      const att = this.store.db.prepare('SELECT mode, purpose FROM attempts WHERE attempt_id = ?').get(sub.attempt_id) as { mode: Mode; purpose: Purpose };
      const meta = this.itemMeta(o.item.id, o.item.version);
      const servable = this.store.knowledge.servableItem(o.item.id, o.item.version, 'learner');
      const hint = (this.store.db.prepare('SELECT MAX(hint_level) AS h FROM assistance_events WHERE attempt_id = ? AND displayed_at < ?').get(sub.attempt_id, sub.created_at) as { h: number | null }).h ?? 0;
      // G0 after N10 (E-41): synthetic when the content origin is a fixture or unknown, or FakeAdapter assessed it.
      const synthetic = isSyntheticEvidence(servable.ok ? servable.content_origin : null, this.providerOf(o.ai_run_id)) || meta?.synthetic === true || competencyId.startsWith('syn.');
      const breadth: TaskBreadth = att.purpose === '7A' ? 'short' : att.purpose === '7B' || att.purpose === '9' ? 'composite'
        : att.mode !== 'guided' && (att.purpose === 'practice' || att.mode === 'exam') ? (meta?.task_scope ?? 'unknown') : 'unknown';
      const modality: Modality = meta ? (meta.skill === 'speaking_text' ? 'speaking' : 'writing') : fallbackModality;
      // C2: a composite task done while a Bước 9 check was due counts for Bước 9 (the integrated check links the task to this attempt).
      const step9Due = att.purpose === '9' || (breadth === 'composite' && Boolean(this.store.db.prepare(
        "SELECT 1 FROM scheduled_tasks WHERE competency_id = ? AND purpose = '9' AND assigned_attempt_id = ? AND schedule_reason IS NOT NULL").get(competencyId, sub.attempt_id)));
      return {
        evidence_source_id: o.evidence_source_id, attempt_id: sub.attempt_id, item_id: o.item.id,
        item_family_id: servable.ok ? servable.item_family_id : meta?.family ?? `unknown:${o.item.id}`,
        at: sub.created_at, study_day: studyDayOf(new Date(sub.created_at)), outcome: o.outcome, use, scope: o.scope, synthetic, kind: sub.kind,
        purpose: att.purpose, mode: att.mode, breadth,
        condition: att.mode === 'guided' ? null : { modality, mode: att.mode, reduced_load: use === 'reduced_load', constraint: meta?.constraint ?? 'unknown' },
        hint_level_before: hint, counts_for_step9: step9Due,
      };
    });
  }

  /** Append-only conclusion history: same evidence + same policy → same row; a new policy version writes a new row. */
  private recordConclusion(decision: CompetencyDecision, records: readonly EvidenceRecord[]): void {
    const { sources } = effectiveSources(records);
    const fingerprint = createHash('sha256').update(canonicalJson(sources.map((s) => [s.evidence_source_id, s.outcome, s.use, s.kind, s.breadth, s.counts_for_step9, s.hint_level_before]))).digest('hex');
    this.store.db.prepare(`INSERT INTO competency_conclusions (conclusion_id, competency_id, policy_id, policy_version, policy_hash, evidence_fingerprint, level, confidence, decision_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (competency_id, policy_hash, evidence_fingerprint) DO NOTHING`)
      .run(randomUUID(), decision.competency_id, decision.policy.id, decision.policy.version, decision.policy.hash, fingerprint, decision.level, decision.confidence, canonicalJson(decision), this.store.now().toISOString());
  }

  competencyDetail(competencyId: string, title = competencyId, skill = 'writing', description = '') {
    const { effective, excluded, classified } = this.classifiedFor(competencyId);
    const summary = summarizeEvidence(competencyId, classified);
    const records = this.evidenceRecords(competencyId, classified);
    const decision = this.policy ? decideCompetency(competencyId, records, this.policy) : null;
    if (decision) this.recordConclusion(decision, records);
    const conclusion: Conclusion = decision
      ? { status: 'decided', state: decision.state, policy: { id: decision.policy.id, version: decision.policy.version }, rationale: decision.rationale, summary }
      : concludeCompetency(summary, null);

    const observationsWithMeta = effective.map((o: ObservationFacts) => {
      const provider = this.providerOf(o.ai_run_id);
      const cls = classified.find((c) => c.observation.observation_id === o.observation_id);
      const rec = records.find((r) => r.evidence_source_id === o.evidence_source_id);
      return {
        observation_id: o.observation_id,
        evidence_source_id: o.evidence_source_id,
        submission_id: o.submission_id,
        outcome: o.outcome,
        opportunity: o.opportunity,
        support_impact: o.support_impact,
        use: cls?.use ?? 'inconclusive',
        provider,
        synthetic: rec?.synthetic ?? provider === 'fake',
      };
    });

    const hypotheses = this.store.db.prepare('SELECT * FROM error_hypotheses WHERE competency_id = ? ORDER BY updated_at DESC').all(competencyId) as {
      hypothesis_id: string; symptom: string; hypothesis: string; status: string; verification_note: string; synthetic: number; updated_at: string;
    }[];

    const scheduled = this.store.db.prepare('SELECT task_id, purpose, mode, due_at, state, synthetic, interval_days, schedule_reason FROM scheduled_tasks WHERE competency_id = ? ORDER BY due_at ASC').all(competencyId) as {
      task_id: string; purpose: Purpose; mode: Mode; due_at: string; state: string; synthetic: number; interval_days: number | null; schedule_reason: string | null;
    }[];

    const now = this.store.now();
    const nowIso = now.toISOString();
    const open = scheduled.filter((s) => s.state === 'PENDING' || s.state === 'AWAITING_OPPORTUNITY');
    const policy = this.policy;
    // C5 applies to verification checks only (7A/7B/9); lessons and practice are never "cần kiểm tra lại".
    const statuses: string[] = policy
      ? open.map((s) => (!['7A', '7B', '9'].includes(s.purpose) ? (s.due_at <= nowIso ? 'due' : 'not_due') : verificationStatus({ due_at: s.due_at, interval_days: s.interval_days, awaiting: s.state === 'AWAITING_OPPORTUNITY', now }, policy.params)))
      : open.map((s) => (s.state === 'AWAITING_OPPORTUNITY' ? 'awaiting_opportunity' : s.due_at <= nowIso ? 'due' : 'not_due'));
    const verificationStatusNow = excluded.some((o) => o.reason === 'REVOKED_DEPENDENCY') || statuses.includes('recheck') || decision?.needs_recheck ? 'needs_recheck'
      : statuses.includes('awaiting_opportunity') ? 'awaiting_opportunity' : statuses.includes('due') ? 'due' : 'not_due';

    // E-56: no observation is not "synthetic": only a synthetic competency, or evidence that is all synthetic, is labelled so.
    const allSynthetic = competencyId.startsWith('syn.') || (observationsWithMeta.length > 0 && observationsWithMeta.every((o) => o.synthetic));
    const label = decision
      ? `${decision.label} · Độ tin cậy: ${decision.confidence_label}${allSynthetic && observationsWithMeta.length > 0 ? ' (dữ liệu hiện có là synthetic, G0 không tính)' : ''}`
      : 'Chưa đủ kết luận (chưa có chính sách D-02 được duyệt)';

    return {
      competency_id: competencyId,
      title,
      skill,
      description,
      // 4 thành phần hồ sơ năng lực theo 02 §2.A và 06 §2.4:
      current_state_label: label,
      conclusion,
      decision,
      evidence_summary: summary,
      excluded_observations_count: excluded.length,
      observations: observationsWithMeta,
      error_hypotheses: hypotheses.map((h) => ({ ...h, synthetic: h.synthetic === 1 })),
      verification_schedule: {
        status: verificationStatusNow,
        tasks: scheduled.map((s) => ({ ...s, is_due: s.due_at <= nowIso, synthetic: s.synthetic === 1 })),
      },
      all_synthetic: allSynthetic,
    };
  }

  // ---- D-02 v1: chuỗi kiểm chứng (C), sổ lỗi (E) ------------------------------------------------
  private scheduleVerification(competencyId: string, originAttemptId: string | null, action: ScheduleAction, synthetic: boolean, at: string): void {
    // E-50: a framework competency is verified on a novel AI-authored essay; none in the bank → coverage gap, no task.
    if (!competencyId.startsWith('syn.')) {
      const item = this.pickVerificationItem(competencyId, 'composite');
      if (!item) { this.verificationGap(competencyId, action.purpose, at); return; }
      const due = new Date(this.store.now().getTime() + action.due_in_days * DAY_MS).toISOString();
      this.store.db.prepare(`INSERT INTO scheduled_tasks (task_id, origin_attempt_id, assigned_attempt_id, competency_id, item_id, item_version, rubric_id, rubric_version,
        purpose, mode, estimated_minutes, meets_min_scope, due_at, state, synthetic, created_at, updated_at, policy_version, schedule_reason, interval_days, step9_index, constraint_kind)
        VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'PENDING', 0, ?, ?, ?, ?, ?, ?, ?)`).run(
        `task-${action.purpose.toLowerCase()}-${randomUUID().slice(0, 8)}`, originAttemptId, competencyId, item.id, item.version, item.rubric.id, item.rubric.version, action.purpose,
        action.purpose === '9' ? 'exam' : 'self_practice', item.estimated_minutes, due, at, at, this.policy?.ref.version ?? null, action.reason, action.interval_days, action.step9_index, action.constraint,
      );
      return;
    }
    const itemId = action.purpose === '7B' ? SYNTHETIC_ITEM_7B_ID : SYNTHETIC_ITEM_9_ID;
    const meta = SYNTHETIC_ITEMS.find((m) => m.id === itemId)!;
    const due = new Date(this.store.now().getTime() + action.due_in_days * DAY_MS).toISOString();
    this.store.db.prepare(`INSERT INTO scheduled_tasks (task_id, origin_attempt_id, assigned_attempt_id, competency_id, item_id, item_version, rubric_id, rubric_version,
      purpose, mode, estimated_minutes, meets_min_scope, due_at, state, synthetic, created_at, updated_at, policy_version, schedule_reason, interval_days, step9_index, constraint_kind)
      VALUES (?, ?, NULL, ?, ?, 'v1', ?, 'v1', ?, ?, ?, 1, ?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      `task-${action.purpose.toLowerCase()}-${randomUUID().slice(0, 8)}`, originAttemptId, competencyId, itemId, SYNTHETIC_WRITING_RUBRIC_ID, action.purpose, meta.mode,
      meta.estimated_minutes, due, synthetic ? 1 : 0, at, at, this.policy?.ref.version ?? null, action.reason, action.interval_days, action.step9_index, action.constraint,
    );
  }

  /** C4: after repeated absent opportunities (or a long wait) the waiting check becomes a short task with a situational constraint. */
  private maybeDirectCheck(taskId: string, at: string): void {
    if (!this.policy) return;
    const t = this.store.db.prepare('SELECT * FROM scheduled_tasks WHERE task_id = ?').get(taskId) as {
      task_id: string; origin_attempt_id: string | null; competency_id: string; purpose: Purpose; due_at: string; state: string; absent_count: number; step9_index: number | null; interval_days: number | null; synthetic: number; schedule_reason: string | null;
    } | undefined;
    if (!t || t.state !== 'AWAITING_OPPORTUNITY' || t.purpose !== '9' || t.schedule_reason === 'C4_DIRECT_CHECK') return;
    if (!needsDirectCheck({ absent_count: t.absent_count, due_at: t.due_at, now: this.store.now() }, this.policy.params)) return;
    this.store.db.prepare("UPDATE scheduled_tasks SET state = 'CANCELLED', updated_at = ? WHERE task_id = ?").run(at, t.task_id);
    this.scheduleVerification(t.competency_id, t.origin_attempt_id, { purpose: '9', due_in_days: 0, step9_index: t.step9_index, interval_days: t.interval_days ?? 0, reason: 'C4_DIRECT_CHECK', constraint: 'semantic' }, t.synthetic === 1, at);
  }

  /** C2: a composite practice/exam task done while Bước 9 is due counts as the maintenance check. */
  private integratedStep9(attemptId: string, competencyId: string, outcome: Outcome, opportunity: Opportunity, at: string): void {
    if (!this.policy) return;
    const attempt = this.store.learning.getAttempt(attemptId);
    const meta = attempt ? this.itemMeta(attempt.item.id, attempt.item.version) : undefined;
    if (!attempt || attempt.mode === 'guided' || meta?.task_scope !== 'composite' || !(attempt.purpose === 'practice' || attempt.mode === 'exam')) return;
    const task = this.store.db.prepare(`SELECT task_id, step9_index, absent_count, synthetic FROM scheduled_tasks WHERE competency_id = ? AND purpose = '9'
      AND state IN ('PENDING', 'AWAITING_OPPORTUNITY') AND due_at <= ? ORDER BY due_at LIMIT 1`).get(competencyId, at) as { task_id: string; step9_index: number | null; absent_count: number; synthetic: number } | undefined;
    if (!task) return;
    if (opportunity !== 'observed' || outcome === 'inconclusive') {
      this.store.db.prepare("UPDATE scheduled_tasks SET state = 'AWAITING_OPPORTUNITY', absent_count = absent_count + ?, updated_at = ? WHERE task_id = ?").run(opportunity === 'absent' ? 1 : 0, at, task.task_id);
      this.maybeDirectCheck(task.task_id, at);
      return;
    }
    const record = this.evidenceRecords(competencyId).find((r) => r.attempt_id === attemptId && r.kind === 'original');
    if (!record || !isIndependent(record)) return; // not independent: the check stays due, nothing advances
    this.store.db.prepare("UPDATE scheduled_tasks SET assigned_attempt_id = ?, state = 'COMPLETED', schedule_reason = COALESCE(schedule_reason, 'C2_STEP9_INTERVAL'), updated_at = ? WHERE task_id = ?").run(attemptId, at, task.task_id);
    const result = afterVerification({ purpose: '9', independent: true, outcome, opportunity, step9_index: task.step9_index ?? 0 }, this.policy.params);
    if (result.schedule) this.scheduleVerification(competencyId, attemptId, result.schedule, task.synthetic === 1, at);
  }

  /** Current status of the hypothesis tied to this attempt (or its origin), for the diagnosis view. */
  private hypothesisStatusFor(attemptId: string): PriorityIssue['hypothesis_status'] {
    const origin = (this.store.db.prepare('SELECT origin_attempt_id FROM writing_loop_states WHERE attempt_id = ?').get(attemptId) as { origin_attempt_id: string | null } | undefined)?.origin_attempt_id;
    const row = this.store.db.prepare('SELECT status FROM error_hypotheses WHERE attempt_id IN (?, ?) ORDER BY updated_at DESC LIMIT 1').get(attemptId, origin ?? attemptId) as { status: PriorityIssue['hypothesis_status'] } | undefined;
    return row?.status ?? 'initial';
  }

  /**
   * E: recompute each hypothesis of the competency from its evidence. Real hypotheses use only real evidence (G0);
   * synthetic hypotheses (flow tests) use their synthetic evidence. Self-repairs never confirm or reject.
   * No stored evidence marks a condition as favouring one cause over competing ones yet, so confirmation needs a discriminating task.
   */
  private refreshHypotheses(competencyId: string, at: string): void {
    if (!this.policy) return;
    const records = this.evidenceRecords(competencyId);
    const rows = this.store.db.prepare('SELECT hypothesis_id, attempt_id, status, synthetic, created_at FROM error_hypotheses WHERE competency_id = ?').all(competencyId) as
      { hypothesis_id: string; attempt_id: string; status: string; synthetic: number; created_at: string }[];
    for (const h of rows) {
      const evidence = records
        .filter((r) => (h.synthetic === 1 ? true : r.scope === 'learner' && !r.synthetic))
        .filter((r) => r.attempt_id === h.attempt_id || r.at > h.created_at)
        .flatMap((r) => (r.outcome === 'met' || r.outcome === 'not_met'
          ? [{ attempt_id: r.attempt_id, outcome: r.outcome, independent: isIndependent(r), supports_specifically: false, contradicts: false }] : []));
      const next = hypothesisStatus({ evidence, discriminating_task: null }, this.policy.params);
      if (next.status !== h.status) {
        this.store.db.prepare('UPDATE error_hypotheses SET status = ?, verification_note = ?, updated_at = ? WHERE hypothesis_id = ?')
          .run(next.status, `D-02 ${this.policy.ref.version}: ${next.reason}`, at, h.hypothesis_id);
      }
    }
  }

  /** D1–D4 inputs of one scheduled task. AI dimensions come from real diagnoses only (P5-5); otherwise null → default 1. */
  private priorityInput(row: { task_id: string; competency_id: string; item_id: string; purpose: Purpose; due_at: string; estimated_minutes: number }, policy: LoadedPolicy): PriorityInput {
    const goal = this.getGoal();
    const meta = this.itemMeta(row.item_id);
    const skill: Skill = meta?.skill === 'speaking_text' ? 'speaking' : 'writing';
    const hyp = this.store.db.prepare('SELECT status FROM error_hypotheses WHERE competency_id = ? ORDER BY updated_at DESC LIMIT 1').get(row.competency_id) as { status: PriorityIssue['hypothesis_status'] } | undefined;
    // D4 "buổi bị bỏ qua": study days with recorded activity after the due day (today excluded) while the task stayed open.
    const skipped = (this.store.db.prepare('SELECT COUNT(DISTINCT study_day) AS n FROM study_activity_events WHERE study_day > ? AND study_day < ?')
      .get(studyDayOf(new Date(row.due_at)), studyDayOf(this.store.now())) as { n: number }).n;
    // D1: AI dimensions from the latest real (non-synthetic) diagnosis of this competency; none → default (1).
    const diags = this.store.db.prepare('SELECT priority_issues_json FROM writing_diagnoses WHERE synthetic = 0 ORDER BY created_at DESC LIMIT 20').all() as { priority_issues_json: string }[];
    const issue = diags.flatMap((d) => JSON.parse(d.priority_issues_json) as PriorityIssue[]).find((i) => i.competency_id === row.competency_id && typeof i.impact === 'number');
    return {
      task_id: row.task_id, purpose: row.purpose, due_at: row.due_at, estimated_minutes: row.estimated_minutes, ai_impact: issue?.impact ?? null, ai_certainty: issue?.certainty ?? null,
      hypothesis_status: hyp?.status ?? null,
      frequency: frequencyScore(this.recentNotMet(row.competency_id, policy.params.priority.frequency_window_days), policy.params),
      relevance: goalRelevance(goal ? { exam_type: goal.exam_type, targets: { writing: goal.target_writing, speaking: goal.target_speaking, reading: goal.target_reading, listening: goal.target_listening } } : null, skill, null),
      skipped_sessions: skipped,
    };
  }

  /** Priority scores of every open scheduled task (used by the catch-up planner, F2). */
  openTaskPriorities(): Map<string, number> {
    const policy = this.policy;
    if (!policy) return new Map();
    const rows = this.store.db.prepare("SELECT task_id, competency_id, item_id, purpose, due_at, estimated_minutes FROM scheduled_tasks WHERE state IN ('PENDING', 'AWAITING_OPPORTUNITY')").all() as
      { task_id: string; competency_id: string; item_id: string; purpose: Purpose; due_at: string; estimated_minutes: number }[];
    return new Map(rankTasks(rows.map((r) => this.priorityInput(r, policy)), this.store.now(), policy.params).map((r) => [r.task_id, r.priority.score]));
  }

  /** D1 frequency: not_met sources of the competency (G0/G1) inside the window. */
  private recentNotMet(competencyId: string, windowDays: number): number {
    const since = this.store.now().getTime() - windowDays * DAY_MS;
    return effectiveSources(this.evidenceRecords(competencyId)).sources.filter((s) => s.outcome === 'not_met' && Date.parse(s.at) >= since).length;
  }
}
