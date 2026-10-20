// Two-layer result parsing (06A §5.C.5): the CLI's JSON output is only a transport envelope. The business JSON
// inside is parsed and checked against the task's contract. Envelope layouts are NOT assumed: a layout must be
// recorded from an observed run (D-01 output contract) before it is used; unverified layouts refuse to parse.
import type { AdapterResult, ProviderError, TaskType } from '../../../application/ai/provider-adapter.js';
import { validateAiResult } from '../result-contracts.js';
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

function classify(text: string, spec: EnvelopeSpec): ProviderError {
  for (const p of spec.error_patterns) if (new RegExp(p.pattern, 'i').test(text)) return p.error;
  return 'BILLING_UNVERIFIED';
}

export function parseEnvelope(stdout: string, exitCode: number | null, spec: EnvelopeSpec, taskType: TaskType): AdapterResult & { detail?: string } {
  if (spec.status !== 'VERIFIED') return { ok: false, error: 'BILLING_UNVERIFIED', detail: 'envelope layout not verified' };
  let envelope: unknown;
  try { envelope = outer(stdout, spec); } catch {
    // Not an envelope at all: an error banner or interactive prompt. Classify only by recorded patterns.
    return { ok: false, error: exitCode === 0 ? 'INVALID_SCHEMA' : classify(stdout, spec), detail: redact(stdout, 300) };
  }
  if (spec.error_flag_path && at(envelope, spec.error_flag_path) === true) {
    const text = JSON.stringify(envelope);
    return { ok: false, error: classify(text, spec), detail: redact(text, 300) };
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
  if (!validateAiResult(taskType, body)) return { ok: false, error: 'INVALID_SCHEMA', detail: 'contract violation' };
  return { ok: true, result: body as Extract<AdapterResult, { ok: true }>['result'] };
}
