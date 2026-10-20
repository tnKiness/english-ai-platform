// Pure parsers for each CLI's JSONL event stream (formats observed 20/10/2026: claude stream-json, codex exec --json,
// agy stream-json). They turn events into short human-readable progress lines and extract what the relay decides on.
import type { ProviderId } from './core.js';

export interface StreamFacts {
  sessionId: string | null;
  /** The agent's final answer; RELAY_STATUS markers are read from here only. */
  finalText: string;
  /** CLI-level errors and non-JSON stderr lines. Tool output is never included, so quoted error text in code can't trigger a switch. */
  diagnostics: string[];
  /** Structured quota signal from the CLI itself (Claude rate_limit_event). */
  quota: { rejected: boolean; warning: boolean; resetAt: Date | null } | null;
}
export const emptyFacts = (): StreamFacts => ({ sessionId: null, finalText: '', diagnostics: [], quota: null });

// Untyped CLI event JSON; every field read is optional-chained and coerced to string/number before use.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ev = Record<string, any>;

const one = (s: unknown, max = 140) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const shortPath = (p: unknown) => one(String(p ?? '').replace(/^.*[\\/]study-english[\\/]/i, ''), 100);
// Codex wraps commands as `"...powershell.exe" -Command '<cmd>'`; show only the inner command.
const innerCommand = (c: unknown) => one(String(c ?? '').replace(/^"?[^"]*powershell\.exe"?\s+-Command\s+/i, '').replace(/^'(.*)'$/s, '$1'));

function toolSummary(name: string, input: Record<string, unknown> | undefined): string {
  const i = input ?? {};
  const target = i.command ?? i.file_path ?? i.path ?? i.Path ?? i.pattern ?? i.query ?? i.url ?? i.description ?? '';
  return `${name}${target ? ` ${name.match(/bash|powershell|command|run/i) ? one(target, 120) : shortPath(target)}` : ''}`;
}

/** Applies one stdout line to `facts`; returns progress lines to show (possibly none). */
export function parseLine(provider: ProviderId, line: string, facts: StreamFacts): string[] {
  const text = line.trim();
  if (!text) return [];
  let e: Ev;
  try { e = JSON.parse(text) as Ev; } catch {
    facts.diagnostics.push(text);
    return [`  ${one(text, 200)}`];
  }
  if (provider === 'claude') return claude(e, facts);
  if (provider === 'codex') return codex(e, facts);
  return agy(e, facts);
}

function claude(e: Ev, f: StreamFacts): string[] {
  if (e.session_id) f.sessionId = e.session_id;
  switch (e.type) {
    case 'system':
      if (e.subtype === 'init') return [`• phiên ${e.session_id} · model ${e.model ?? '?'}`];
      if (e.subtype === 'post_turn_summary' && e.status_detail) return [`• ${one(e.status_detail)}`];
      return [];
    case 'assistant':
      return (e.message?.content ?? []).flatMap((c: Ev) =>
        c.type === 'tool_use' ? [`→ ${toolSummary(c.name, c.input)}`]
          : c.type === 'text' && c.text?.trim() ? [`💬 ${one(c.text, 200)}`] : []);
    case 'rate_limit_event': {
      const info = e.rate_limit_info ?? {};
      const resetAt = typeof info.resetsAt === 'number' ? new Date(info.resetsAt * 1000) : null;
      // `warning` stays set once seen: a later "allowed" event in the same turn does not undo a near-limit notice.
      f.quota = { rejected: info.status === 'rejected', warning: f.quota?.warning || info.status === 'allowed_warning', resetAt };
      if (info.status === 'rejected') { f.diagnostics.push(`usage limit reached (${info.rateLimitType ?? 'limit'})`); return [`⛔ hết hạn mức ${info.rateLimitType ?? ''}`]; }
      if (info.status === 'allowed_warning') return [`⚠ sắp hết hạn mức ${info.rateLimitType ?? ''}`];
      return [];
    }
    case 'result':
      f.finalText = String(e.result ?? '');
      if (e.is_error) f.diagnostics.push(`${e.subtype ?? 'error'} ${e.api_error_status ?? ''} ${f.finalText}`);
      return [`■ kết thúc (${e.subtype}, ${e.num_turns ?? '?'} lượt, ${Math.round((e.duration_ms ?? 0) / 1000)}s)`];
    default: return [];
  }
}

function codex(e: Ev, f: StreamFacts): string[] {
  if (e.type === 'thread.started') { f.sessionId = e.thread_id; return [`• phiên ${e.thread_id}`]; }
  if (e.type === 'error' || e.type === 'turn.failed') {
    const msg = one(e.message ?? e.error?.message ?? JSON.stringify(e), 300);
    f.diagnostics.push(msg); return [`✖ ${msg}`];
  }
  if (e.type === 'turn.completed') return [`■ kết thúc lượt (${e.usage?.output_tokens ?? '?'} token ra)`];
  const item = e.item as Ev | undefined;
  if (!item) return [];
  if (e.type === 'item.started' && item.type === 'command_execution') return [`→ ${innerCommand(item.command)}`];
  if (e.type !== 'item.completed') return [];
  switch (item.type) {
    case 'agent_message': f.finalText = String(item.text ?? ''); return item.text?.trim() ? [`💬 ${one(item.text, 200)}`] : [];
    case 'command_execution': return item.exit_code ? [`  ↳ thoát mã ${item.exit_code}`] : [];
    case 'file_change': return [`✎ ${(item.changes ?? []).map((c: Ev) => `${c.kind ?? ''} ${shortPath(c.path)}`).join(', ') || 'sửa file'}`];
    case 'error': f.diagnostics.push(one(item.message, 300)); return [`✖ ${one(item.message)}`];
    default: return [];
  }
}

function agy(e: Ev, f: StreamFacts): string[] {
  if (e.event === 'init') { f.sessionId = e.conversation_id ?? null; return [`• phiên ${e.conversation_id} · model ${e.init?.model ?? '?'}`]; }
  if (e.event === 'result') {
    const r = e.result ?? {};
    f.finalText = String(r.response ?? '');
    if (r.status !== 'SUCCESS') f.diagnostics.push(`${r.status} ${one(r.error ?? r.response, 300)}`);
    return [`■ kết thúc (${r.status}, ${Math.round(r.duration_seconds ?? 0)}s)`];
  }
  if (e.event === 'error') { const msg = one(e.error?.message ?? e.message ?? JSON.stringify(e), 300); f.diagnostics.push(msg); return [`✖ ${msg}`]; }
  const s = e.step_update as Ev | undefined;
  if (!s) return [];
  if (s.step_type === 'tool' && s.state === 'ACTIVE') return [`→ ${toolSummary(s.tool_name ?? 'tool', s.tool_info?.parameters)}`];
  if (s.step_type === 'tool' && s.state !== 'DONE' && s.state !== 'ACTIVE') return [`  ↳ ${s.state}`];
  return [];
}

export function resumeCommand(provider: ProviderId, sessionId: string): string {
  if (provider === 'claude') return `claude --resume ${sessionId}`;
  if (provider === 'codex') return `codex resume ${sessionId}`;
  return `agy --conversation ${sessionId}`;
}
