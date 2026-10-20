// Builder & QC Console use cases (06 §3–4). Lists show metadata only; opening content records the shared
// exposure first (06 §4.1–2). Dry-runs use dry_run attempts and never touch learner evidence (06 §4.3).
import { CLI_PROVIDERS } from '../ai/subscription-guard.js';
import { DATA_POLICY } from '../context/scoped-reader.js';
import type { AttemptRecord, JobRecord, NewManifest, NewSubmission, NewAttempt, NewJob, SubmissionRecord } from '../ports.js';
import type { ExposureLevel, Scope } from '../../domain/evidence/types.js';
import type { UnitKind } from './ports.js';

export interface ConsoleDeps {
  units: { packageUnits(packageId: string, version: string): { kind: UnitKind; id: string; version: string; unit_type: string; hash: string }[] };
  json: { get(kind: UnitKind, id: string, version: string, expectedHash?: string): unknown };
  items: { itemMeta(id: string, version: string): { item_family_id: string; shared_stimulus_id: string | null; hash: string } | undefined };
  learning: {
    recordExposure(e: { idempotency_key: string; item: { id: string; version: string; hash: string }; item_family_id: string; shared_stimulus_id: string | null; surface: 'builder' | 'learner'; scope: Scope; level: ExposureLevel }): { event_id: string; created: boolean };
    createAttempt(input: NewAttempt): AttemptRecord; submit(input: NewSubmission): SubmissionRecord; createManifest(input: NewManifest): { manifest_id: string; input_hash: string };
  };
  queue: { enqueue(job: NewJob): JobRecord };
  transaction<T>(fn: () => T): T;
  contextPolicyVersion: string;
}

const LEVELS: Record<string, ExposureLevel[]> = { task_item: ['prompt'], answer_key: ['answer', 'explanation'] };

export class ConsoleService {
  constructor(private d: ConsoleDeps) {}

  /**
   * "Xem nội dung / đáp án chi tiết": exposure is committed before content is read, so a failed read can only
   * over-record, never under-record. Units not tied to an item (rubric, policy…) have no item exposure to log.
   */
  openContent(packageId: string, version: string, unit: { kind: UnitKind; id: string; version: string }, requestId: string): { content: unknown; exposure: { level: ExposureLevel; created: boolean }[] } {
    const u = this.d.units.packageUnits(packageId, version).find((x) => x.kind === unit.kind && x.id === unit.id && x.version === unit.version);
    if (!u) throw new Error('Unit is not part of this package version');
    let itemRef: { id: string; version: string } | null = null;
    if (u.unit_type === 'task_item') itemRef = { id: u.id, version: u.version };
    const levels = LEVELS[u.unit_type] ?? [];
    const exposure = this.d.transaction(() => {
      if (u.unit_type === 'answer_key') {
        // The key names its item; read it only to log exposure against that item before returning anything.
        itemRef = (this.d.json.get(u.kind, u.id, u.version, u.hash) as { body: { item: { id: string; version: string } } }).body.item;
      }
      if (!itemRef) return [];
      const meta = this.d.items.itemMeta(itemRef.id, itemRef.version);
      if (!meta) throw new Error('Linked item is not registered');
      const ref = itemRef;
      return levels.map((level) => ({ level, created: this.d.learning.recordExposure({ idempotency_key: `builder:${requestId}:${level}`, item: { id: ref.id, version: ref.version, hash: meta.hash },
        item_family_id: meta.item_family_id, shared_stimulus_id: meta.shared_stimulus_id, surface: 'builder', scope: 'dry_run', level }).created }));
    });
    return { content: this.d.json.get(u.kind, u.id, u.version, u.hash), exposure };
  }

  /** Builder dry-run of the assessment flow on a package item; isolated in dry_run scope. */
  dryRun(packageId: string, version: string, inputText: string, requestId: string): { attempt_id: string; job_id: string } {
    const units = this.d.units.packageUnits(packageId, version);
    const item = units.find((u) => u.unit_type === 'task_item');
    const rubric = units.find((u) => u.kind === 'rubric');
    if (!item || !rubric) throw new Error('Dry-run needs a task item and a rubric in the package');
    return this.d.transaction(() => {
      const attempt = this.d.learning.createAttempt({ request_key: `dry:${requestId}`, scope: 'dry_run', item: { id: item.id, version: item.version }, rubric: { id: rubric.id, version: rubric.version }, mode: 'exam', purpose: 'practice' });
      const submission = this.d.learning.submit({ request_key: `dry-sub:${requestId}`, attempt_id: attempt.attempt_id, content: inputText });
      const rubricBody = (this.d.json.get('rubric', rubric.id, rubric.version, rubric.hash) as { body: unknown }).body;
      const manifest = this.d.learning.createManifest({ manifest_id: `dry:${requestId}`, role: 'assessor', phase: 'assessment', policy_version: this.d.contextPolicyVersion,
        rubric: { id: rubric.id, version: rubric.version, hash: rubric.hash }, knowledge: [{ kind: 'rubric', id: rubric.id, version: rubric.version, hash: rubric.hash }],
        disclosure_level: 0, allowed_resource_ids: [], payload: { data_policy: DATA_POLICY, submission_text: inputText, rubric: rubricBody } });
      const job = this.d.queue.enqueue({ idempotency_key: `dry:${requestId}`, attempt_id: attempt.attempt_id, submission_id: submission.submission_id, snapshot_version: submission.snapshot_version,
        attempt_generation: 1, task_type: 'writing.assess', phase: 'assessment', context_manifest_id: manifest.manifest_id, rubric_version: rubric.version,
        required_capabilities: ['text', 'structured_result'], eligible_providers: [...CLI_PROVIDERS], limits: { max_attempts_total: 3, timeout_seconds: 120 } });
      return { attempt_id: attempt.attempt_id, job_id: job.job_id };
    });
  }
}
