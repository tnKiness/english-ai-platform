CREATE TABLE audio_sessions (
  attempt_id TEXT PRIMARY KEY REFERENCES attempts(attempt_id)
);
CREATE TABLE audio_recordings (
  recording_id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES audio_sessions(attempt_id),
  request_key TEXT NOT NULL UNIQUE,
  media_id TEXT NOT NULL REFERENCES media_assets(media_id),
  kind TEXT NOT NULL CHECK(kind IN ('original','retake')),
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX one_original_audio ON audio_recordings(attempt_id) WHERE kind='original';
CREATE TABLE audio_transcripts (
  transcript_id TEXT PRIMARY KEY,
  recording_id TEXT NOT NULL REFERENCES audio_recordings(recording_id),
  request_key TEXT NOT NULL UNIQUE,
  revision INTEGER NOT NULL,
  source TEXT NOT NULL CHECK(source='learner_entered'),
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(recording_id, revision)
);
CREATE TRIGGER audio_recordings_no_update BEFORE UPDATE ON audio_recordings BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER audio_recordings_no_delete BEFORE DELETE ON audio_recordings BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER audio_transcripts_no_update BEFORE UPDATE ON audio_transcripts BEGIN SELECT RAISE(ABORT,'immutable'); END;
CREATE TRIGGER audio_transcripts_no_delete BEFORE DELETE ON audio_transcripts BEGIN SELECT RAISE(ABORT,'immutable'); END;
