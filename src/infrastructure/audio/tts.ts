// E-44 (D-06, Listening): local text-to-speech with Piper (offline, no network, no account). Used to voice Listening
// scripts that the pipeline writes and QC checks; the transcript stays the source of truth for answers and QC4.
// - The engine lives outside the repository and var/ (default %LOCALAPPDATA%\study-english\tts, override with
//   STUDY_ENGLISH_TTS_DIR): piper/piper.exe and voices/<voice>.onnx (+ .onnx.json).
// - Each call is a bounded child process (timeout, output cap, process tree ended) with a minimal environment; text
//   goes on stdin, the WAV is written to a fresh temp directory and accepted only if its bytes are a WAV file.
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { runBoundedProcess, type ProcessRequest } from '../ai/bounded-process.js';
import { audioFormat } from '../sources/page.js';

export interface TtsVoice { id: string; model: string; config: string }
export interface TtsStatus { ready: boolean; dir: string; executable: string; executable_sha256: string | null; voices: TtsVoice[]; issues: string[] }
export interface PiperOptions {
  dir?: string;
  /** Tests only: run another executable (e.g. node + a fake script) instead of piper.exe. */
  executable?: string; prefixArgs?: string[];
  run?: (r: ProcessRequest) => Promise<{ stdout: string; stderr: string; code: number | null }>;
  timeoutMs?: number;
}

export const MAX_TTS_CHARS = 20_000;
const VOICE_ID = /^[A-Za-z0-9_-]{1,80}$/;

export function defaultTtsDir(): string {
  return resolve(process.env.STUDY_ENGLISH_TTS_DIR ?? join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? tmpdir(), 'AppData', 'Local'), 'study-english', 'tts'));
}

export class PiperTts {
  readonly dir: string;
  constructor(private o: PiperOptions = {}) { this.dir = resolve(o.dir ?? defaultTtsDir()); }
  private exe() { return this.o.executable ?? join(this.dir, 'piper', 'piper.exe'); }

  voices(): TtsVoice[] {
    const vdir = join(this.dir, 'voices');
    if (!existsSync(vdir)) return [];
    return readdirSync(vdir).filter((f) => f.endsWith('.onnx')).map((f) => f.slice(0, -5)).filter((id) => VOICE_ID.test(id))
      .map((id) => ({ id, model: join(vdir, `${id}.onnx`), config: join(vdir, `${id}.onnx.json`) })).filter((v) => existsSync(v.config)).sort((a, b) => a.id.localeCompare(b.id));
  }

  status(): TtsStatus {
    const exe = this.exe();
    const issues: string[] = [];
    const has = existsSync(exe);
    if (!has) issues.push('ENGINE_MISSING');
    const voices = this.voices();
    if (voices.length === 0) issues.push('NO_VOICE');
    return { ready: issues.length === 0, dir: this.dir, executable: exe, executable_sha256: has ? createHash('sha256').update(readFileSync(exe)).digest('hex') : null, voices, issues };
  }

  /** WAV bytes for `text` in `voiceId`. Throws with a short code on any failure; never returns non-WAV bytes. */
  async synthesize(text: string, voiceId: string, opts: { lengthScale?: number; sentenceSilence?: number; speaker?: number } = {}): Promise<Uint8Array> {
    const clean = text.replace(/\r\n?/g, '\n').trim();
    if (!clean) throw new Error('TTS_EMPTY_TEXT');
    if (clean.length > MAX_TTS_CHARS) throw new Error('TTS_TEXT_TOO_LONG');
    const voice = this.voices().find((v) => v.id === voiceId);
    if (!voice) throw new Error('TTS_UNKNOWN_VOICE');
    if (!existsSync(this.exe())) throw new Error('TTS_ENGINE_MISSING');
    const work = mkdtempSync(join(tmpdir(), 'study-english-tts-'));
    try {
      const out = join(work, 'out.wav');
      const args = [...(this.o.prefixArgs ?? []), '--model', voice.model, '--config', voice.config, '--output_file', out];
      if (opts.lengthScale !== undefined) args.push('--length_scale', String(Math.min(2, Math.max(0.5, opts.lengthScale))));
      if (opts.sentenceSilence !== undefined) args.push('--sentence_silence', String(Math.min(3, Math.max(0, opts.sentenceSilence))));
      if (opts.speaker !== undefined && Number.isInteger(opts.speaker) && opts.speaker >= 0) args.push('--speaker', String(opts.speaker));
      const env: NodeJS.ProcessEnv = { SystemRoot: process.env.SystemRoot, TEMP: work, TMP: work };
      const r = await (this.o.run ?? runBoundedProcess)({ executable: this.exe(), args, cwd: work, input: `${clean}\n`, env, timeoutMs: this.o.timeoutMs ?? 300_000, maxOutputBytes: 256_000 });
      if (r.code !== 0) throw new Error(`TTS_FAILED: exit ${r.code}`);
      if (!existsSync(out)) throw new Error('TTS_NO_OUTPUT');
      const bytes = new Uint8Array(readFileSync(out));
      if (audioFormat(bytes)?.ext !== 'wav') throw new Error('TTS_NOT_WAV');
      return bytes;
    } finally { rmSync(work, { recursive: true, force: true }); }
  }
}
