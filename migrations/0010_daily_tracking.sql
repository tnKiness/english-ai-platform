-- P5-1 Daily tracking (06A §9, §10.A; 02 §5.C.2; decision E-25). Append-only activity and declarations; the daily
-- view is computed on read with an as_of time. No content, answers or audio are stored here.

-- Heartbeats sent while a learning surface is open (or audio plays). client_event_id makes a retried or offline-synced
-- beat idempotent. study_day is the Asia/Bangkok day of occurred_at, computed by the application.
CREATE TABLE study_activity_events (
  event_id TEXT PRIMARY KEY,
  client_event_id TEXT NOT NULL UNIQUE,
  activity TEXT NOT NULL CHECK (activity IN ('writing', 'reading', 'listening', 'speaking', 'thinking', 'review')),
  surface TEXT NOT NULL CHECK (surface IN ('workspace', 'reading', 'audio', 'today', 'progress')),
  attempt_id TEXT REFERENCES attempts (attempt_id),
  span_seconds INTEGER NOT NULL CHECK (span_seconds BETWEEN 1 AND 120),
  occurred_at TEXT NOT NULL,
  study_day TEXT NOT NULL CHECK (length(study_day) = 10),
  offline INTEGER NOT NULL CHECK (offline IN (0, 1)),
  received_at TEXT NOT NULL
);
CREATE INDEX study_activity_events_day ON study_activity_events (study_day, occurred_at);
CREATE TRIGGER study_activity_events_no_update BEFORE UPDATE ON study_activity_events BEGIN SELECT RAISE(ABORT, 'append-only: study_activity_events'); END;
CREATE TRIGGER study_activity_events_no_delete BEFORE DELETE ON study_activity_events BEGIN SELECT RAISE(ABORT, 'append-only: study_activity_events'); END;

-- Learner declarations per day: planned rest, studied offline (optional self-reported minutes), today's time budget.
-- The latest row per (study_day, kind) wins; active = 0 withdraws a declaration. History is kept.
CREATE TABLE daily_study_logs (
  log_id TEXT PRIMARY KEY,
  request_key TEXT NOT NULL UNIQUE,
  study_day TEXT NOT NULL CHECK (length(study_day) = 10),
  kind TEXT NOT NULL CHECK (kind IN ('planned_rest', 'offline', 'budget')),
  active INTEGER NOT NULL CHECK (active IN (0, 1)),
  minutes INTEGER CHECK (minutes IS NULL OR minutes BETWEEN 0 AND 480),
  note TEXT NOT NULL DEFAULT '' CHECK (length(note) <= 500),
  recorded_at TEXT NOT NULL
);
CREATE INDEX daily_study_logs_day ON daily_study_logs (study_day, kind, recorded_at);
CREATE TRIGGER daily_study_logs_no_update BEFORE UPDATE ON daily_study_logs BEGIN SELECT RAISE(ABORT, 'append-only: daily_study_logs'); END;
CREATE TRIGGER daily_study_logs_no_delete BEFORE DELETE ON daily_study_logs BEGIN SELECT RAISE(ABORT, 'append-only: daily_study_logs'); END;

-- Rule-based reminders (no AI). dedupe_key stops a second copy of the same reminder, e.g. after the machine reopens.
-- Only the in-app channel exists; Telegram/email are outside the first MVP (IMPLEMENTATION_PLAN P5).
CREATE TABLE notification_outbox (
  notification_id TEXT PRIMARY KEY,
  dedupe_key TEXT NOT NULL UNIQUE,
  channel TEXT NOT NULL CHECK (channel IN ('in_app')),
  kind TEXT NOT NULL CHECK (kind IN ('daily_reminder')),
  study_day TEXT NOT NULL CHECK (length(study_day) = 10),
  payload_json TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('PENDING', 'DISMISSED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TRIGGER notification_outbox_frozen BEFORE UPDATE ON notification_outbox
WHEN NEW.dedupe_key IS NOT OLD.dedupe_key OR NEW.payload_json IS NOT OLD.payload_json OR NEW.study_day IS NOT OLD.study_day
  OR (OLD.state = 'DISMISSED' AND NEW.state IS NOT OLD.state)
BEGIN SELECT RAISE(ABORT, 'notification content or dismissed state cannot change'); END;
CREATE TRIGGER notification_outbox_no_delete BEFORE DELETE ON notification_outbox BEGIN SELECT RAISE(ABORT, 'immutable: notification_outbox'); END;

-- Scheduler last_run (06A §9.3): a job runs at most once per study day, so reopening the machine sends nothing twice.
CREATE TABLE scheduler_runs (
  job_name TEXT PRIMARY KEY,
  last_run_day TEXT NOT NULL CHECK (length(last_run_day) = 10),
  last_run_at TEXT NOT NULL
);
