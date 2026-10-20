-- 0004_learning_p3 — P3 learning frame, goals, server-side writing diagnosis & step-by-step hints, error bank and scheduled checks.
-- Applied migrations are immutable: change the schema with a new numbered file.

-- Learner goal & study budget (01 Bước 1, 06 §2.1). Append-only or single-learner row updated with version tracking.
CREATE TABLE learner_goals (
  goal_id TEXT PRIMARY KEY,
  target_band_overall REAL NOT NULL CHECK (target_band_overall BETWEEN 0 AND 9),
  target_listening REAL NOT NULL CHECK (target_listening BETWEEN 0 AND 9),
  target_reading REAL NOT NULL CHECK (target_reading BETWEEN 0 AND 9),
  target_writing REAL NOT NULL CHECK (target_writing BETWEEN 0 AND 9),
  target_speaking REAL NOT NULL CHECK (target_speaking BETWEEN 0 AND 9),
  exam_type TEXT NOT NULL CHECK (exam_type IN ('academic', 'general_training')),
  exam_date TEXT,
  daily_minutes INTEGER NOT NULL CHECK (daily_minutes BETWEEN 5 AND 480),
  weekly_minutes INTEGER NOT NULL CHECK (weekly_minutes BETWEEN 15 AND 3360),
  updated_at TEXT NOT NULL
);

-- Pre-generated diagnosis and hints stored ONLY on the server (01 Bước 4–5, 04 §2.B/D, 06 §2.3, 06A §7.C.3).
-- Full hint levels live in hints_json on the server; API routes slice by unlocked_hint_level before responding.
CREATE TABLE writing_diagnoses (
  diagnosis_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id),
  submission_id TEXT NOT NULL UNIQUE REFERENCES submissions (submission_id),
  job_id TEXT NOT NULL REFERENCES ai_jobs (job_id),
  priority_issues_json TEXT NOT NULL,
  other_issues_json TEXT NOT NULL,
  hints_json TEXT NOT NULL,
  disclosure_checked INTEGER NOT NULL CHECK (disclosure_checked IN (0, 1)),
  synthetic INTEGER NOT NULL CHECK (synthetic IN (0, 1)),
  created_at TEXT NOT NULL
);

-- Attempt workflow state for the closed-loop learning cycle (01 Bước 3–8).
CREATE TABLE writing_loop_states (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts (attempt_id),
  origin_attempt_id TEXT REFERENCES attempts (attempt_id),
  competency_id TEXT NOT NULL,
  step INTEGER NOT NULL CHECK (step BETWEEN 3 AND 9),
  unlocked_hint_level INTEGER NOT NULL DEFAULT 0 CHECK (unlocked_hint_level BETWEEN 0 AND 3),
  learner_choice TEXT CHECK (learner_choice IS NULL OR learner_choice IN ('try_more', 'direct_explanation')),
  clarification_count INTEGER NOT NULL DEFAULT 0 CHECK (clarification_count >= 0),
  concept_check_passed INTEGER CHECK (concept_check_passed IS NULL OR concept_check_passed IN (0, 1)),
  step6_branch TEXT CHECK (step6_branch IS NULL OR step6_branch IN ('micro_lesson', 'fading_scaffold', 'contextual_practice', 'fast_track')),
  step6_completed INTEGER NOT NULL DEFAULT 0 CHECK (step6_completed IN (0, 1)),
  linked_7a_attempt_id TEXT REFERENCES attempts (attempt_id),
  synthetic INTEGER NOT NULL DEFAULT 1 CHECK (synthetic IN (0, 1)),
  updated_at TEXT NOT NULL
);

-- Error bank hypotheses (01 Bước 4, 02 §4, 06 §2.4): symptom vs root-cause hypothesis vs verification evidence.
CREATE TABLE error_hypotheses (
  hypothesis_id TEXT PRIMARY KEY,
  competency_id TEXT NOT NULL,
  evidence_source_id TEXT NOT NULL REFERENCES evidence_sources (evidence_source_id),
  attempt_id TEXT NOT NULL REFERENCES attempts (attempt_id),
  symptom TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('initial', 'insufficient_evidence', 'confirmed', 'rejected')),
  verification_note TEXT NOT NULL,
  synthetic INTEGER NOT NULL CHECK (synthetic IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Scheduled follow-up tasks (7A, 7B, 9, lesson, practice) with fake-clock testable due_at (01 Bước 7–9, 02 §5).
CREATE TABLE scheduled_tasks (
  task_id TEXT PRIMARY KEY,
  origin_attempt_id TEXT REFERENCES attempts (attempt_id),
  assigned_attempt_id TEXT REFERENCES attempts (attempt_id),
  competency_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  item_version TEXT NOT NULL,
  rubric_id TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('lesson', 'practice', '7A', '7B', '9')),
  mode TEXT NOT NULL CHECK (mode IN ('guided', 'self_practice', 'exam')),
  estimated_minutes INTEGER NOT NULL CHECK (estimated_minutes > 0),
  meets_min_scope INTEGER NOT NULL CHECK (meets_min_scope IN (0, 1)),
  due_at TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'AWAITING_OPPORTUNITY', 'CANCELLED')),
  synthetic INTEGER NOT NULL DEFAULT 1 CHECK (synthetic IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX scheduled_tasks_due ON scheduled_tasks (state, due_at);

CREATE TRIGGER writing_diagnoses_no_update BEFORE UPDATE ON writing_diagnoses BEGIN SELECT RAISE(ABORT, 'immutable: writing_diagnoses'); END;
CREATE TRIGGER writing_diagnoses_no_delete BEFORE DELETE ON writing_diagnoses BEGIN SELECT RAISE(ABORT, 'immutable: writing_diagnoses'); END;
CREATE TRIGGER learner_goals_no_delete BEFORE DELETE ON learner_goals BEGIN SELECT RAISE(ABORT, 'immutable: learner_goals'); END;
CREATE TRIGGER error_hypotheses_no_delete BEFORE DELETE ON error_hypotheses BEGIN SELECT RAISE(ABORT, 'immutable: error_hypotheses'); END;
CREATE TRIGGER scheduled_tasks_no_delete BEFORE DELETE ON scheduled_tasks BEGIN SELECT RAISE(ABORT, 'immutable: scheduled_tasks'); END;
