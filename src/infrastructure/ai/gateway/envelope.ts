// Two-layer result parsing (06A §5.C.5): the CLI's JSON output is only a transport envelope. The business JSON
// inside is parsed and checked against the task's contract. Envelope layouts are NOT assumed: a layout must be
// recorded from an observed run (D-01 output contract) before it is used; unverified layouts refuse to parse.
import type { AdapterResult, ProviderError, TaskType } from '../../../application/ai/provider-adapter.js';
import { validateAiResult, aiResultErrors } from '../result-contracts.js';
import { classifyRunFailure, resetTimeIn } from './failover.js';
import { redact } from './redaction.js';

export interface EnvelopeSpec {
  status: 'VERIFIED' | 'NEEDS_VERIFICATION';
  /** Where the layout came from: an observed run (verified) or documentation (candidate). */
  source: string;
  format: 'json_object' | 'jsonl_last_object';
  /** jsonl only: use the last line whose value at `path` equals `equals` (event streams end with usage lines). */
  line_select?: { path: string[]; equals: string };
  result_path: string[];
  error_flag_path: string[] | null;
  /** Non-true values at error_flag_path (e.g. agy result.status !== 'SUCCESS') also trigger error classification. */
  error_flag_not_equals?: string;
  /** Observed error texts → error codes. Anything unclassified stops as BILLING_UNVERIFIED (06A §8 chốt 6). */
  error_patterns: { pattern: string; error: ProviderError }[];
}

const at = (value: unknown, path: string[]): unknown => path.reduce<unknown>((v, k) => (v !== null && typeof v === 'object' ? (v as Record<string, unknown>)[k] : undefined), value);

function outer(stdout: string, spec: EnvelopeSpec): unknown {
  const text = stdout.trim();
  if (spec.format === 'json_object') return JSON.parse(text);
  const objects = text.split(/\r?\n/).filter((l) => l.trim().startsWith('{')).map((l) => JSON.parse(l) as unknown);
  const select = spec.line_select;
  const chosen = select ? objects.filter((o) => at(o, select.path) === select.equals) : objects;
  if (chosen.length === 0) throw new Error('no JSON line');
  return chosen[chosen.length - 1];
}

interface RunOutput { stdout: string; stderr?: string; exitCode: number | null; now: Date }

/**
 * Mẫu lỗi đã ghi trong bằng chứng D-01 được xét trước. Không khớp thì hỏi lõi định tuyến của ai-router (E-24): hạn mức,
 * giới hạn tốc độ, mất đăng nhập, phía hãng lỗi. Vẫn không nhận ra thì dừng như BILLING_UNVERIFIED (06A §8 chốt 6).
 */
function classify(text: string, spec: EnvelopeSpec, run: RunOutput): { error: ProviderError; reset_at?: string | null } {
  const routed = classifyRunFailure(run, run.now);
  const recorded = spec.error_patterns.find((p) => new RegExp(p.pattern, 'i').test(text))?.error;
  if (!recorded) return routed ?? { error: 'BILLING_UNVERIFIED' };
  return recorded === 'QUOTA_EXHAUSTED' || recorded === 'RATE_LIMIT' ? { error: recorded, reset_at: routed?.reset_at ?? resetTimeIn(text, run.now) } : { error: recorded };
}

export function parseEnvelope(stdout: string, exitCode: number | null, spec: EnvelopeSpec, taskType: TaskType, extra: { stderr?: string; now?: Date } = {}): AdapterResult & { detail?: string } {
  const run: RunOutput = { stdout, stderr: extra.stderr, exitCode, now: extra.now ?? new Date() };
  if (spec.status !== 'VERIFIED') return { ok: false, error: 'BILLING_UNVERIFIED', detail: 'envelope layout not verified' };
  let envelope: unknown;
  try { envelope = outer(stdout, spec); } catch {
    // Not an envelope at all: an error banner or interactive prompt. Classify only by recorded patterns.
    // Thoát mã 0 mà không có envelope: chỉ lỗi do chính CLI báo trong luồng sự kiện mới đổi được kết luận INVALID_SCHEMA.
    const failure = exitCode === 0 ? (classifyRunFailure(run, run.now) ?? { error: 'INVALID_SCHEMA' as const }) : classify(stdout, spec, run);
    return { ok: false, ...failure, detail: redact(stdout, 300) };
  }
  if (spec.error_flag_path) {
    const flagVal = at(envelope, spec.error_flag_path);
    const isErr = spec.error_flag_not_equals !== undefined
      ? flagVal !== undefined && flagVal !== spec.error_flag_not_equals
      : flagVal === true;
    if (isErr) {
      const text = JSON.stringify(envelope);
      return { ok: false, ...classify(text, spec, run), detail: redact(text, 300) };
    }
  }
  const inner = at(envelope, spec.result_path);
  if (typeof inner !== 'string') return { ok: false, error: 'INVALID_SCHEMA', detail: 'result field missing' };
  let body: unknown;
  try {
    // Accept a single fenced block, nothing else: no "find the first {" heuristics.
    const fenced = /^```(?:json)?\s*\n([\s\S]*)\n```$/.exec(inner.trim());
    body = JSON.parse(fenced ? fenced[1]! : inner.trim());
  } catch { return { ok: false, error: 'INVALID_SCHEMA', detail: 'inner result is not JSON' }; }
  if (typeof body !== 'object' || body === null || (body as { schema_version?: unknown }).schema_version !== '1') return { ok: false, error: 'INVALID_SCHEMA', detail: 'schema_version mismatch' };
  if (!validateAiResult(taskType, body)) { const why = aiResultErrors(taskType, body); return { ok: false, error: 'INVALID_SCHEMA', detail: `contract violation${why.length ? `: ${why.join('; ')}` : ''}` }; }
  return { ok: true, result: body as Extract<AdapterResult, { ok: true }>['result'] };
}
