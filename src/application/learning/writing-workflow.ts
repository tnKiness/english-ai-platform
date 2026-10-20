// Learning Workflow & Frame service cho P3-1, P3-2, P3-3 (01 Bước 1–9, 02 §2–5, 03 §1–2, 04 §2, 06 §2).
// Dùng lại repositories P1, Rule Engine P1, pipeline P2 và FakeAdapter. Mọi kết quả từ FakeAdapter đều
// gắn nhãn synthetic: true và không bao giờ nâng trạng thái năng lực thật hay suy ra Band (D-02).
import { randomUUID } from 'node:crypto';
import { CLI_PROVIDERS } from '../ai/subscription-guard.js';
import type { AiResult, Assessment } from '../ai/provider-adapter.js';
import { DATA_POLICY } from '../context/scoped-reader.js';
import { classifyEvidence } from '../../domain/evidence/attribution.js';
import { concludeCompetency, summarizeEvidence, type ClassifiedObservation } from '../../domain/evidence/inference.js';
import type { Mode, ObservationFacts, Opportunity, Outcome, Purpose } from '../../domain/evidence/types.js';
import { assessNovelty } from '../../domain/knowledge/novelty.js';
import { effectiveObservations } from '../../domain/knowledge/revocation.js';
import { decideStep6Branch, sliceUnlockedHints, verifyHintDisclosurePolicy, type PreGeneratedHints, type Step6Branch, type VisibleHintSlice } from '../../domain/learning/scaffold-hints.js';
import { filterEligible, type TaskCandidate } from '../../domain/scheduling/eligibility.js';
import { FakeAdapter } from '../../infrastructure/ai/fake-adapter.js';
import { canonicalJson } from '../../infrastructure/files/paths.js';
import type { Store } from '../../infrastructure/sqlite/store.js';
import { processNextJob } from '../../worker/worker.js';
import type { ObservationDraft } from '../ports.js';
import { submitForAssessment } from './submit-for-assessment.js';

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
    linked_7a_attempt_id: string | null;
    synthetic: boolean;
  } | null;
  diagnosis: DiagnosisView | null;
}

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
    competencies: [SYNTHETIC_COMPETENCY_ID, SYNTHETIC_SECONDARY_COMPETENCY_ID],
    outline_suggestions: [],
    vocabulary_frame: [],
  },
];

export class LearningWorkflowService {
  constructor(private store: Store) {}

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
      FROM attempts WHERE scope = 'learner' AND state IN ('DRAFT', 'SUBMITTED', 'REPAIRING') ORDER BY updated_at DESC`).all() as {
      attempt_id: string; item_id: string; item_version: string; mode: Mode; purpose: Purpose; state: string; updated_at: string;
    }[];

    const scheduledRows = this.store.db.prepare(`SELECT * FROM scheduled_tasks WHERE state IN ('PENDING', 'AWAITING_OPPORTUNITY') ORDER BY due_at, created_at`).all() as {
      task_id: string; origin_attempt_id: string | null; assigned_attempt_id: string | null; competency_id: string; item_id: string; item_version: string;
      rubric_id: string; rubric_version: string; purpose: Purpose; mode: Mode; estimated_minutes: number; meets_min_scope: number; due_at: string; state: string; synthetic: number;
    }[];

    const dueRows = scheduledRows.filter((r) => r.due_at <= nowIso);
    const futureRows = scheduledRows.filter((r) => r.due_at > nowIso);

    const candidates: TaskCandidate[] = dueRows.map((r) => {
      const servable = this.store.knowledge.servableItem(r.item_id, r.item_version, 'learner');
      const releaseState = this.store.knowledge.releaseState(SYNTHETIC_WRITING_PKG_ID, 'v1') ?? 'draft';
      return {
        task_id: r.task_id,
        item: { id: r.item_id, version: r.item_version, item_family_id: servable.ok ? servable.item_family_id : 'unknown', shared_stimulus_id: servable.ok ? servable.shared_stimulus_id : null, derived_from: [] },
        package: { id: SYNTHETIC_WRITING_PKG_ID, version: 'v1', release_state: releaseState },
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
      { competency_ids: [SYNTHETIC_COMPETENCY_ID, SYNTHETIC_SECONDARY_COMPETENCY_ID, SYNTHETIC_SPEAKING_TEXT_COMPETENCY_ID], available_minutes: availableMinutes },
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

    const recommended = filtered.eligible.slice(0, 3).map((c) => {
      const row = dueRows.find((r) => r.task_id === c.task_id)!;
      const meta = SYNTHETIC_ITEMS.find((m) => m.id === c.item.id);
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
        title: SYNTHETIC_ITEMS.find((m) => m.id === a.item_id)?.title ?? a.item_id,
      })),
      recommended_tasks: recommended,
      deferred_or_ineligible: filtered.rejected,
      upcoming_scheduled: futureRows.map((r) => ({
        task_id: r.task_id,
        title: SYNTHETIC_ITEMS.find((m) => m.id === r.item_id)?.title ?? r.item_id,
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
    const rubricId = input.rubric_id ?? SYNTHETIC_WRITING_RUBRIC_ID;
    const rubricVersion = input.rubric_version ?? 'v1';
    const competencyId = input.competency_id ?? SYNTHETIC_COMPETENCY_ID;

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
          VALUES (?, NULL, ?, ?, 0, 1, ?)`).run(created.attempt_id, competencyId, step, at);
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
        impacts: [{ competency_id: SYNTHETIC_COMPETENCY_ID, impact: 'affected', reduced_load: true }],
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
    });

    // Nếu trước đó có mở gợi mở mà chưa có post_snapshot_id thì gắn snapshot của bản sửa này.
    const adapter = input.adapter ?? new FakeAdapter('success');
    const opportunity: Opportunity = input.opportunity_override
      ?? (input.content.includes('[SYNTHETIC_NO_OPPORTUNITY]') ? 'absent' : 'observed');

    await processNextJob({
      queue: this.store.queue,
      adapter,
      loadContext: (id) => this.store.learning.loadManifestPayload(id),
      interpret: (result: AiResult): ObservationDraft[] => {
        const assess = result as Assessment;
        const loop = this.store.db.prepare('SELECT unlocked_hint_level FROM writing_loop_states WHERE attempt_id = ?').get(input.attempt_id) as { unlocked_hint_level: number } | undefined;
        const usedHints = (loop?.unlocked_hint_level ?? 0) > 0;
        const supportImpact = isRepair || usedHints || attempt.mode === 'guided' ? 'affected' : 'no_related_effect_detected';
        return [
          {
            observation_key: `${submission.submission_id}:${SYNTHETIC_COMPETENCY_ID}`,
            competency_id: SYNTHETIC_COMPETENCY_ID,
            processing: assess.processing,
            outcome: assess.outcome,
            measurement_quality: 'sufficient',
            opportunity,
            support_impact: supportImpact,
          },
          {
            observation_key: `${submission.submission_id}:${SYNTHETIC_SECONDARY_COMPETENCY_ID}`,
            competency_id: SYNTHETIC_SECONDARY_COMPETENCY_ID,
            processing: assess.processing,
            outcome: input.content.includes('[SYNTHETIC_CC_REGRESSION]') ? 'not_met' : assess.outcome === 'not_met' ? 'met' : assess.outcome,
            measurement_quality: 'sufficient',
            opportunity: 'observed',
            support_impact: supportImpact,
          },
        ];
      },
      owner: 'p3-synthetic-worker',
      leaseMs: 60_000,
      heartbeatMs: 10_000,
      provider: 'fake',
    });

    this.store.uow.run(() => {
      const existingDiag = this.store.db.prepare('SELECT diagnosis_id FROM writing_diagnoses WHERE submission_id = ?').get(submission.submission_id);
      if (existingDiag) return;

      const obsRow = this.store.db.prepare('SELECT outcome, opportunity FROM observations WHERE submission_id = ? AND competency_id = ?')
        .get(submission.submission_id, SYNTHETIC_COMPETENCY_ID) as { outcome: Outcome; opportunity: Opportunity } | undefined;
      const outcome: Outcome = obsRow?.outcome ?? 'inconclusive';

      // Kiểm duyệt chính sách tiết lộ trước khi lưu gói gợi mở sinh sẵn ở server (04 §2.D, 06A §7.C.3).
      const disclosureCheck = verifyHintDisclosurePolicy(DEFAULT_PREGENERATED_HINTS);
      if (!disclosureCheck.ok) {
        throw new Error(`Pre-generated hints failed disclosure policy: ${disclosureCheck.reasons.join(', ')}`);
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
              hypothesis_status: isRepair ? 'confirmed' : 'initial',
              expected_verification: 'Sửa lại câu chủ đề bằng mệnh đề nhượng bộ (Bước 5) và tự viết bài mới không gợi ý ở Bước 7A.',
            },
          ];

      const otherIssues = outcome === 'met'
        ? []
        : [
            'Một số cụm từ lặp lại ở đoạn kết (đã gác lại theo nguyên tắc chỉ ưu tiên 1–2 điểm trọng tâm mỗi lượt).',
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
      } else if (existingHyp) {
        const nextStatus = outcome === 'met' ? 'confirmed' : 'initial';
        const note = outcome === 'met'
          ? 'Đã tự sửa được ở Bước 5 (scaffolded_repair, synthetic); chờ kiểm chứng độc lập ở 7A.'
          : 'Vẫn còn lúng túng khi tự sửa ở Bước 5.';
        this.store.db.prepare('UPDATE error_hypotheses SET status = ?, verification_note = ?, updated_at = ? WHERE hypothesis_id = ?')
          .run(nextStatus, note, at, existingHyp.hypothesis_id);
      }

      // Chuyển bước trong vòng học:
      if (attempt.purpose === '7A' || attempt.purpose === '7B' || attempt.purpose === '9') {
        this.applyVerificationStep8And9(input.attempt_id, attempt.purpose, submission.submission_id, outcome, obsRow?.opportunity ?? opportunity, at);
      } else {
        const nextStep = outcome === 'met' ? 6 : 5;
        this.store.db.prepare('UPDATE writing_loop_states SET step = ?, updated_at = ? WHERE attempt_id = ?')
          .run(nextStep, at, input.attempt_id);
      }
    });

    return this.getWorkspaceView(input.attempt_id);
  }

  /**
   * Bước 8 & Bước 9: Cập nhật có điều kiện và lập lịch 7B / 9 sau khi hoàn thành 7A / 7B / 9 (01 Bước 7–9, 02 §3).
   * Mọi kết quả từ FakeAdapter đều giữ `synthetic: true` và không bao giờ nâng trạng thái năng lực thật.
   */
  private applyVerificationStep8And9(attemptId: string, purpose: Purpose, submissionId: string, outcome: Outcome, opportunity: Opportunity, at: string): void {
    const loop = this.store.db.prepare('SELECT origin_attempt_id, competency_id FROM writing_loop_states WHERE attempt_id = ?')
      .get(attemptId) as { origin_attempt_id: string | null; competency_id: string } | undefined;
    const compId = loop?.competency_id ?? SYNTHETIC_COMPETENCY_ID;

    // Kiểm tra xem tiêu chí phụ có bị tụt không (regression check ở 7A/7B).
    const secondaryObs = this.store.db.prepare('SELECT outcome FROM observations WHERE submission_id = ? AND competency_id = ?')
      .get(submissionId, SYNTHETIC_SECONDARY_COMPETENCY_ID) as { outcome: Outcome } | undefined;
    const regressed = secondaryObs?.outcome === 'not_met';

    if (purpose === '7A') {
      this.store.db.prepare('UPDATE writing_loop_states SET step = 8, updated_at = ? WHERE attempt_id = ?').run(at, attemptId);
      if (loop?.origin_attempt_id) {
        const hypStatus = outcome === 'met' && !regressed ? 'confirmed' : 'insufficient_evidence';
        const hypNote = outcome === 'met' && !regressed
          ? 'Đạt ở 7A không gợi ý (synthetic candidate); đã xếp lịch 7B và Bước 9 để kiểm tra tích hợp & duy trì.'
          : regressed
            ? 'Đạt tiêu chí đang sửa ở 7A nhưng làm tụt tiêu chí phụ (Coherence); chưa công nhận ổn định.'
            : 'Chưa đạt ở nhiệm vụ chuyển giao 7A; cần củng cố thêm.';
        this.store.db.prepare('UPDATE error_hypotheses SET status = ?, verification_note = ?, updated_at = ? WHERE attempt_id = ?')
          .run(hypStatus, hypNote, at, loop.origin_attempt_id);
      }

      if (outcome === 'met' && !regressed) {
        // Lập lịch 7B (kiểm chứng tích hợp sau 1 ngày) và Bước 9 (kiểm tra duy trì giãn cách sau 3 ngày).
        const nowMs = this.store.now().getTime();
        const due7B = new Date(nowMs + 24 * 60 * 60 * 1000).toISOString();
        const due9 = new Date(nowMs + 3 * 24 * 60 * 60 * 1000).toISOString();
        const insertTask = this.store.db.prepare(`INSERT INTO scheduled_tasks (task_id, origin_attempt_id, assigned_attempt_id, competency_id, item_id, item_version,
          rubric_id, rubric_version, purpose, mode, estimated_minutes, meets_min_scope, due_at, state, synthetic, created_at, updated_at)
          VALUES (?, ?, NULL, ?, ?, 'v1', ?, 'v1', ?, ?, ?, 1, ?, 'PENDING', 1, ?, ?)`);
        insertTask.run(`task-7b-${attemptId.slice(0, 8)}`, attemptId, compId, SYNTHETIC_ITEM_7B_ID, SYNTHETIC_WRITING_RUBRIC_ID, '7B', 'self_practice', 30, due7B, at, at);
        insertTask.run(`task-9-${attemptId.slice(0, 8)}`, attemptId, compId, SYNTHETIC_ITEM_9_ID, SYNTHETIC_WRITING_RUBRIC_ID, '9', 'exam', 30, due9, at, at);
      }
      this.store.db.prepare("UPDATE scheduled_tasks SET state = 'COMPLETED', updated_at = ? WHERE assigned_attempt_id = ?").run(at, attemptId);
      return;
    }

    if (purpose === '7B') {
      this.store.db.prepare('UPDATE writing_loop_states SET step = 8, updated_at = ? WHERE attempt_id = ?').run(at, attemptId);
      this.store.db.prepare("UPDATE scheduled_tasks SET state = 'COMPLETED', updated_at = ? WHERE assigned_attempt_id = ?").run(at, attemptId);
      return;
    }

    if (purpose === '9') {
      this.store.db.prepare('UPDATE writing_loop_states SET step = 9, updated_at = ? WHERE attempt_id = ?').run(at, attemptId);
      // Bước 9 Opportunity-to-Use (01 Bước 9): nếu bài làm không có cơ hội bộc lộ cấu trúc mục tiêu (opportunity === 'absent'),
      // KHÔNG kết luận là đã giữ hay đã quên, mà giữ trạng thái AWAITING_OPPORTUNITY.
      if (opportunity === 'absent') {
        this.store.db.prepare("UPDATE scheduled_tasks SET state = 'AWAITING_OPPORTUNITY', updated_at = ? WHERE assigned_attempt_id = ?").run(at, attemptId);
      } else {
        this.store.db.prepare("UPDATE scheduled_tasks SET state = 'COMPLETED', updated_at = ? WHERE assigned_attempt_id = ?").run(at, attemptId);
      }
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
    const bundle = JSON.parse(diag.hints_json) as PreGeneratedHints;

    const policyCheck = verifyHintDisclosurePolicy(bundle);
    if (!policyCheck.ok) {
      throw Object.assign(new Error(`Hint bundle failed disclosure check: ${policyCheck.reasons.join(', ')}`), { statusCode: 500 });
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
        impacts: [{ competency_id: SYNTHETIC_COMPETENCY_ID, impact: 'affected', reduced_load: level >= 2 }],
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
    const bundle = JSON.parse(diag!.hints_json) as PreGeneratedHints;

    this.store.uow.run(() => {
      const preSnap = this.store.learning.saveSnapshot(attemptId, 'pre_assistance', currentDraftText);
      this.store.learning.recordAssistance({
        idempotency_key: `direct-explanation:${attemptId}:${latestSub.submission_id}:${requestKey}`,
        attempt_id: attemptId,
        submission_id: latestSub.submission_id,
        hint_level: 3,
        content: bundle.level_3,
        impacts: [{ competency_id: SYNTHETIC_COMPETENCY_ID, impact: 'affected', reduced_load: true }],
        pre_snapshot_id: preSnap.snapshot_id,
        post_snapshot_id: null,
      });
      this.store.db.prepare("UPDATE writing_loop_states SET learner_choice = 'direct_explanation', unlocked_hint_level = 3, updated_at = ? WHERE attempt_id = ?")
        .run(this.store.now().toISOString(), attemptId);
    });

    return this.getWorkspaceView(attemptId);
  }

  // ---- Bước 6: Concept-check & Bổ sung kiến thức mục tiêu (01 Bước 5–6) ------------------------
  completeStep6(attemptId: string, conceptCheckAnswer: string): AttemptWorkspaceView {
    const attempt = this.store.learning.getAttempt(attemptId);
    if (!attempt) throw Object.assign(new Error('Unknown attempt'), { statusCode: 404 });
    if (!conceptCheckAnswer.trim()) {
      throw Object.assign(new Error('Concept check answer is required'), { statusCode: 400, code: 'EMPTY_CONCEPT_CHECK' });
    }

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

    const loop = this.store.db.prepare('SELECT step6_completed, linked_7a_attempt_id, competency_id FROM writing_loop_states WHERE attempt_id = ?')
      .get(originAttemptId) as { step6_completed: number; linked_7a_attempt_id: string | null; competency_id: string } | undefined;
    if (!loop || loop.step6_completed !== 1) {
      throw Object.assign(new Error('Complete Step 6 before starting Step 7A verification'), { statusCode: 409, code: 'STEP6_NOT_COMPLETED' });
    }
    if (loop.linked_7a_attempt_id) {
      return this.getWorkspaceView(loop.linked_7a_attempt_id);
    }

    // Kiểm tra điều kiện đủ của bài 7A qua bộ lọc điều phối Stage 1 (filterEligible).
    const servable = this.store.knowledge.servableItem(SYNTHETIC_ITEM_7A_ID, 'v1', 'learner');
    if (!servable.ok) throw Object.assign(new Error(`7A item not servable: ${servable.reason}`), { statusCode: 409 });

    const candidate: TaskCandidate = {
      task_id: `7a-for-${originAttemptId}`,
      item: { id: SYNTHETIC_ITEM_7A_ID, version: 'v1', item_family_id: servable.item_family_id, shared_stimulus_id: servable.shared_stimulus_id, derived_from: [] },
      package: { id: SYNTHETIC_WRITING_PKG_ID, version: 'v1', release_state: 'active' },
      competency_ids: [loop.competency_id],
      purpose: '7A',
      mode: 'self_practice',
      estimated_minutes: 20,
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
        item: { id: SYNTHETIC_ITEM_7A_ID, version: 'v1' },
        rubric: { id: origin.rubric.id, version: origin.rubric.version },
        mode: 'self_practice',
        purpose: '7A',
      });

      this.store.learning.recordExposure({
        idempotency_key: `learner:prompt:${created.attempt_id}`,
        item: { id: SYNTHETIC_ITEM_7A_ID, version: 'v1', hash: created.item.hash },
        item_family_id: servable.item_family_id,
        shared_stimulus_id: servable.shared_stimulus_id,
        surface: 'learner',
        scope: 'learner',
        level: 'prompt',
      });

      const at = this.store.now().toISOString();
      this.store.db.prepare(`INSERT INTO writing_loop_states (attempt_id, origin_attempt_id, competency_id, step, unlocked_hint_level, synthetic, updated_at)
        VALUES (?, ?, ?, 7, 0, 1, ?)`).run(created.attempt_id, originAttemptId, loop.competency_id, at);
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

    const itemObj = this.store.json.get('item', attempt.item.id, attempt.item.version, attempt.item.hash) as {
      title: string; prompt: string; skill: 'writing' | 'speaking_text'; genre: string; min_words: number;
      recommended_minutes: number; criteria_summary: string[]; outline_suggestions?: string[]; vocabulary_frame?: string[];
    };

    const latestSnap = this.store.db.prepare(`SELECT snapshot_version, content, created_at FROM snapshots
      WHERE attempt_id = ? ORDER BY snapshot_version DESC LIMIT 1`).get(attemptId) as { snapshot_version: number; content: string; created_at: string } | undefined;

    const subRows = this.store.db.prepare(`SELECT submission_id, revision, kind, repair_attempt_index, content, created_at
      FROM submissions WHERE attempt_id = ? ORDER BY revision ASC`).all(attemptId) as {
      submission_id: string; revision: number; kind: 'original' | 'repair'; repair_attempt_index: number; content: string; created_at: string;
    }[];

    const submissions = subRows.map((s) => {
      const obs = this.store.db.prepare('SELECT outcome FROM observations WHERE submission_id = ? AND competency_id = ?')
        .get(s.submission_id, SYNTHETIC_COMPETENCY_ID) as { outcome: Outcome } | undefined;
      return {
        ...s,
        outcome: obs?.outcome ?? null,
        synthetic: true,
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
        const fullHints = JSON.parse(diagRow.hints_json) as PreGeneratedHints;
        const unlocked = isExam ? 0 : (loopRow?.unlocked_hint_level ?? 0);
        // Cắt quyền: chỉ trả các nấc đã mở!
        const sliced = sliceUnlockedHints(fullHints, unlocked);
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
        linked_7a_attempt_id: loopRow.linked_7a_attempt_id,
        synthetic: loopRow.synthetic === 1,
      };
    }

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
    };
  }

  // ---- Tiến độ & Hồ sơ năng lực (02 §2–4, 06 §2.4, D-02) ---------------------------------------
  progressView() {
    this.ensureSyntheticWritingCatalog();
    const competencies = [
      {
        competency_id: SYNTHETIC_COMPETENCY_ID,
        title: 'Writing Task 2 — Duy trì lập trường nhất quán (Task Response)',
        skill: 'writing',
        description: 'Trả lời đầy đủ các phần của đề bài và giữ lập trường rõ ràng, nhất quán xuyên suốt các đoạn văn.',
      },
      {
        competency_id: SYNTHETIC_SECONDARY_COMPETENCY_ID,
        title: 'Writing Task 2 — Tổ chức đoạn văn & liên kết (Coherence & Cohesion)',
        skill: 'writing',
        description: 'Sắp xếp luận điểm mạch lạc, mỗi đoạn một ý trọng tâm rõ ràng và dùng phương tiện liên kết tự nhiên.',
      },
      {
        competency_id: SYNTHETIC_SPEAKING_TEXT_COMPETENCY_ID,
        title: 'Speaking (dạng văn bản theo E-11) — Phát triển ý & từ vựng',
        skill: 'speaking_text',
        description: 'Lên ý tưởng, dàn ý và lựa chọn từ vựng dạng văn bản; chưa chấm phát âm hay âm thanh trực tiếp (D-06).',
      },
    ];

    const profiles = competencies.map((comp) => this.competencyDetail(comp.competency_id, comp.title, comp.skill, comp.description));

    return {
      policy_status: 'POLICY_NOT_APPROVED',
      band_reporting_enabled: false,
      disclaimer: 'Chưa đủ kết luận về mức năng lực hoặc Band (D-02 chưa có chính sách kiểm định được duyệt). Mọi nhận định từ FakeAdapter đều mang nhãn synthetic và không nâng hồ sơ năng lực thật.',
      data_policy: DATA_POLICY,
      competencies: profiles,
    };
  }

  competencyDetail(competencyId: string, title = competencyId, skill = 'writing', description = '') {
    const rawObs = this.store.learning.observations(competencyId, 'learner');
    const { effective, excluded } = effectiveObservations(rawObs, this.store.knowledge.revocations());
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

    const summary = summarizeEvidence(competencyId, classified);
    // D-02: không có policy được duyệt -> luôn truyền null để trả về POLICY_NOT_APPROVED / NO_EFFECTIVE_EVIDENCE.
    const conclusion = concludeCompetency(summary, null);

    // Kiểm tra xem các observation có đến từ provider 'fake' (synthetic) không.
    const observationsWithMeta = effective.map((o: ObservationFacts) => {
      const runRow = this.store.db.prepare('SELECT provider FROM ai_runs WHERE run_id = ?').get(o.ai_run_id) as { provider: string } | undefined;
      const cls = classified.find((c) => c.observation.observation_id === o.observation_id);
      return {
        observation_id: o.observation_id,
        evidence_source_id: o.evidence_source_id,
        submission_id: o.submission_id,
        outcome: o.outcome,
        opportunity: o.opportunity,
        support_impact: o.support_impact,
        use: cls?.use ?? 'inconclusive',
        provider: runRow?.provider ?? 'fake',
        synthetic: (runRow?.provider ?? 'fake') === 'fake',
      };
    });

    const hypotheses = this.store.db.prepare('SELECT * FROM error_hypotheses WHERE competency_id = ? ORDER BY updated_at DESC').all(competencyId) as {
      hypothesis_id: string; symptom: string; hypothesis: string; status: string; verification_note: string; synthetic: number; updated_at: string;
    }[];

    const scheduled = this.store.db.prepare('SELECT task_id, purpose, mode, due_at, state, synthetic FROM scheduled_tasks WHERE competency_id = ? ORDER BY due_at ASC').all(competencyId) as {
      task_id: string; purpose: Purpose; mode: Mode; due_at: string; state: string; synthetic: number;
    }[];

    const nowIso = this.store.now().toISOString();
    const awaitingOpp = scheduled.some((s) => s.state === 'AWAITING_OPPORTUNITY');
    const dueNow = scheduled.some((s) => s.state === 'PENDING' && s.due_at <= nowIso);
    const verificationStatus = awaitingOpp ? 'awaiting_opportunity' : dueNow ? 'due' : 'not_due';

    return {
      competency_id: competencyId,
      title,
      skill,
      description,
      // 4 thành phần hồ sơ năng lực theo 02 §2.A và 06 §2.4:
      current_state_label: 'Chưa đủ kết luận (chờ chính sách kiểm định D-02; dữ liệu hiện tại là synthetic)',
      conclusion,
      evidence_summary: summary,
      excluded_observations_count: excluded.length,
      observations: observationsWithMeta,
      error_hypotheses: hypotheses.map((h) => ({ ...h, synthetic: h.synthetic === 1 })),
      verification_schedule: {
        status: verificationStatus,
        tasks: scheduled.map((s) => ({ ...s, is_due: s.due_at <= nowIso, synthetic: s.synthetic === 1 })),
      },
      all_synthetic: observationsWithMeta.every((o) => o.synthetic),
    };
  }
}
