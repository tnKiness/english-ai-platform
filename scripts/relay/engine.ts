// Shared execution layer for the relay CLI and the Relay Console: one CLI run with live progress, session history,
// per-session transcripts and the single-writer lock. All state lives under var/relay (gitignored).
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { decideOutcome, emptyState, type Outcome, type ProviderId, type RelayState } from './core.js';
import type { ProviderSpec } from './providers.js';
import { runCli } from './run-process.js';
import { emptyFacts, parseLine, resumeCommand, type StreamFacts } from './stream.js';

export const ROOT = resolve(import.meta.dirname, '..', '..');
/** RELAY_STATE_DIR exists for tests; normal use keeps state in var/relay. */
export const DIR = process.env.RELAY_STATE_DIR ?? join(ROOT, 'var', 'relay');
export const STATE = join(DIR, 'state.json');
export const TASK = join(DIR, 'task.json');
export const HISTORY = join(DIR, 'sessions.json');
export const LIVE = join(DIR, 'live.log');
export const LOCK = join(DIR, 'lock');
export const TRANSCRIPTS = join(DIR, 'transcripts');

export interface SessionRecord { provider: ProviderId; session_id: string; started_at: string; outcome: string; resume: string; title?: string }
export interface TranscriptEntry { at: string; role: 'user' | 'assistant' | 'progress' | 'status'; text: string }

export const readJson = <T>(file: string, fallback: T): T => { try { return JSON.parse(readFileSync(file, 'utf8')) as T; } catch { return fallback; } };
export const writeJson = (file: string, data: unknown) => writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
export const loadState = (): RelayState => ({ ...emptyState(), ...readJson<Partial<RelayState>>(STATE, {}) });
const clock = () => new Date().toLocaleTimeString('vi-VN', { hour12: false });

export function ensureDirs() {
  mkdirSync(join(DIR, 'runs'), { recursive: true });
  mkdirSync(TRANSCRIPTS, { recursive: true });
  if (!existsSync(LIVE)) writeFileSync(LIVE, '', 'utf8');
}

/** Appends one line to var/relay/live.log (what `Get-Content -Wait` and the console's live panel show). */
export function appendLive(line: string, provider?: ProviderId): string {
  const text = provider ? `[${clock()}] ${provider.padEnd(6)} │ ${line}` : line;
  try { appendFileSync(LIVE, `${text}\n`, 'utf8'); } catch { /* live view is best-effort */ }
  return text;
}

const safeId = (id: string) => id.replace(/[^A-Za-z0-9_-]/g, '');
export const transcriptFile = (provider: ProviderId, sessionId: string) => join(TRANSCRIPTS, `${provider}-${safeId(sessionId)}.jsonl`);
export function readTranscript(provider: ProviderId, sessionId: string): TranscriptEntry[] {
  const file = transcriptFile(provider, sessionId);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((l) => { try { return [JSON.parse(l) as TranscriptEntry]; } catch { return []; } });
}

/** Single writer: the relay CLI and the console's chat runs share one lock file holding the owner pid. */
export function acquireLock(): () => void {
  mkdirSync(DIR, { recursive: true });
  try { writeFileSync(LOCK, String(process.pid), { flag: 'wx' }); } catch {
    const pid = Number(readFileSync(LOCK, 'utf8'));
    if (pid !== process.pid && isAlive(pid)) throw new Error(`Relay khác đang chạy (pid ${pid}). Chỉ một tiến trình được sửa workspace tại một thời điểm.`);
    writeFileSync(LOCK, String(process.pid));
  }
  return () => { if (existsSync(LOCK) && readFileSync(LOCK, 'utf8') === String(process.pid)) rmSync(LOCK); };
}
export function lockOwner(): number | null {
  if (!existsSync(LOCK)) return null;
  const pid = Number(readFileSync(LOCK, 'utf8'));
  return isAlive(pid) ? pid : null;
}
function isAlive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }

export type EngineEvent =
  | { kind: 'progress'; text: string }
  | { kind: 'session'; sessionId: string }
  | { kind: 'final'; text: string };

export interface RunRequest {
  provider: ProviderId; spec: ProviderSpec; prompt: string; mode: 'work' | 'read';
  /** Continue this native session of the same CLI instead of starting a new one. */
  resume?: string | null;
  /** What the transcript shows as the user turn (relay prompts are long and generated). */
  userLabel: string;
  timeoutMs: number; env: NodeJS.ProcessEnv; signal?: AbortSignal;
  onEvent?: (event: EngineEvent) => void;
  /** Write progress to live.log (off for smoke runs). */
  live?: boolean;
  /** Relay tasks must end with a RELAY_STATUS marker; a plain chat turn that exits 0 with an answer is complete. */
  expectMarker?: boolean;
}
export interface Execution { outcome: Outcome; facts: StreamFacts; exitCode: number | null; seconds: number }

/** One CLI run; the outcome is decided from the final answer, CLI errors and quota events (see core.decideOutcome). */
export async function execute(req: RunRequest): Promise<Execution> {
  ensureDirs();
  const { provider: id, spec } = req;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const base = join(DIR, 'runs', `${stamp}-${id}${req.live === false ? '-smoke' : ''}`);
  const inv = spec.invocation(req.prompt, { cwd: ROOT, mode: req.mode, lastMessageFile: `${base}.last.txt`, resume: req.resume ?? null });
  const facts = emptyFacts(); const started = Date.now();
  // Transcript lines are buffered until the CLI reports its session id (resumed runs know it up front).
  let sessionId: string | null = req.resume ?? null;
  const pending: TranscriptEntry[] = [];
  const record = (role: TranscriptEntry['role'], text: string) => {
    const entry = { at: new Date().toISOString(), role, text };
    if (sessionId) appendFileSync(transcriptFile(id, sessionId), `${JSON.stringify(entry)}\n`, 'utf8'); else pending.push(entry);
  };
  record('user', req.userLabel);
  const progress = (text: string) => {
    if (req.live !== false) appendLive(text, id);
    record('progress', text);
    req.onEvent?.({ kind: 'progress', text });
  };
  const r = await runCli(spec.bin as string, inv.args, { cwd: ROOT, env: req.env, stdin: inv.stdin, timeoutMs: req.timeoutMs, logFile: `${base}.log`, signal: req.signal,
    onLine: (line, stream) => {
      if (stream === 'stderr') { if (line.trim()) { facts.diagnostics.push(line); progress(`  ${line.slice(0, 200)}`); } return; }
      const lines = parseLine(id, line, facts);
      if (!sessionId && facts.sessionId) {
        sessionId = facts.sessionId;
        req.onEvent?.({ kind: 'session', sessionId });
        for (const e of pending.splice(0)) appendFileSync(transcriptFile(id, sessionId), `${JSON.stringify(e)}\n`, 'utf8');
      }
      for (const out of lines) progress(out);
    } });
  // Codex also writes its last message to a file; prefer it when the stream ended without one.
  if (!facts.finalText && inv.lastMessageFile && existsSync(inv.lastMessageFile)) facts.finalText = readFileSync(inv.lastMessageFile, 'utf8');
  facts.sessionId ??= sessionId;
  let outcome = decideOutcome({ exitCode: r.exitCode, timedOut: r.timedOut, finalText: facts.finalText,
    diagnostics: facts.diagnostics.join('\n'), quota: facts.quota }, new Date());
  if (req.expectMarker === false && outcome.kind === 'STOP' && r.exitCode === 0 && facts.finalText.trim()) outcome = { kind: 'DONE' };
  if (facts.finalText.trim()) { record('assistant', facts.finalText.trim()); req.onEvent?.({ kind: 'final', text: facts.finalText.trim() }); }
  const label = outcome.kind === 'SWITCH' ? outcome.failure : outcome.kind;
  record('status', `${label} · thoát ${r.exitCode ?? '-'} · ${Math.round((Date.now() - started) / 1000)}s`);
  if (facts.sessionId) {
    const history = readJson<SessionRecord[]>(HISTORY, []);
    const prev = history.find((h) => h.provider === id && h.session_id === facts.sessionId);
    history.push({ provider: id, session_id: facts.sessionId, started_at: new Date(started).toISOString(), outcome: label,
      resume: resumeCommand(id, facts.sessionId), title: prev?.title ?? req.userLabel.split('\n')[0]?.slice(0, 80) });
    writeJson(HISTORY, history.slice(-300));
  }
  return { outcome, facts, exitCode: r.exitCode, seconds: Math.round((Date.now() - started) / 1000) };
}
