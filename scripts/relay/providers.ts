import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProviderId } from './core.js';

export interface Invocation { args: string[]; stdin: string | null; lastMessageFile?: string }
export interface ProviderSpec {
  id: ProviderId; label: string; bin: string | null;
  /**
   * mode 'work' may edit the workspace; 'read' is read-only. Never a sandbox/permission bypass flag.
   * `resume` continues that native session of the same CLI (verified 20/10/2026 for agy; claude/codex per --help).
   */
  invocation(prompt: string, opts: { cwd: string; mode: 'work' | 'read'; lastMessageFile: string; resume?: string | null }): Invocation;
  /** Provider-specific rules appended to every prompt (e.g. which tools work headless). */
  promptNote?: string;
  /** Proves the CLI is logged in through a subscription, not an API key. null = cannot be checked. */
  checkSubscription(env: NodeJS.ProcessEnv): { ok: boolean | null; detail: string };
}

const LOCAL = process.env.LOCALAPPDATA ?? '';
const firstExisting = (...paths: (string | undefined)[]) => paths.find((p): p is string => !!p && existsSync(p)) ?? null;
function where(name: string): string[] {
  const r = spawnSync('where.exe', [name], { encoding: 'utf8', shell: false, windowsHide: true });
  return r.status === 0 ? r.stdout.trim().split(/\r?\n/) : [];
}
function newestCodex(): string | undefined {
  const root = join(LOCAL, 'OpenAI', 'Codex', 'bin');
  if (!existsSync(root)) return undefined;
  return readdirSync(root).map((d) => join(root, d, 'codex.exe')).filter(existsSync)
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}
function claudeExe(): string | undefined {
  // The npm shim claude.cmd only forwards to this native binary; spawning it avoids cmd.exe quoting.
  for (const shim of where('claude.cmd')) {
    const exe = join(dirname(shim), 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    if (existsSync(exe)) return exe;
  }
  return where('claude.exe')[0];
}
function run(bin: string, args: string[], env: NodeJS.ProcessEnv) {
  const r = spawnSync(bin, args, { encoding: 'utf8', shell: false, windowsHide: true, env, timeout: 30_000 });
  return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}`.trim() };
}

// Default model per provider (user choice 20/10/2026): Opus 5.5 Medium → GPT-6 Astra Medium → Gemini 4 Argon Medium.
// Override with RELAY_<PROVIDER>_MODEL / RELAY_<PROVIDER>_EFFORT.
export const DEFAULT_MODELS = {
  claude: { model: process.env.RELAY_CLAUDE_MODEL ?? 'claude-opus-5-5', effort: process.env.RELAY_CLAUDE_EFFORT ?? 'medium' },
  codex: { model: process.env.RELAY_CODEX_MODEL ?? 'gpt-6-astra', effort: process.env.RELAY_CODEX_EFFORT ?? 'medium' },
  agy: { model: process.env.RELAY_AGY_MODEL ?? 'gemini-4-argon-medium' }, // agy encodes effort in the model id
} as const;

const READ_TOOLS = ['Read', 'Glob', 'Grep'];
// Same commands for Claude Code's Bash and PowerShell tools: on Windows it may run either, and a Bash(...) rule
// does not cover PowerShell (20/10/2026: `npm.cmd run check` was denied, so tests never ran).
const WORK_COMMANDS = ['npm.cmd run:*', 'npm run:*', 'npx.cmd tsx:*', 'npx tsx:*', 'npx.cmd vitest:*', 'npx vitest:*',
  'git status:*', 'git diff:*', 'git log:*', 'node --version'];
const WORK_TOOLS = [...READ_TOOLS, 'Edit', 'Write', ...WORK_COMMANDS.flatMap((c) => [`Bash(${c})`, `PowerShell(${c})`])];
const DENIED = ['git commit:*', 'git push:*'].flatMap((c) => [`Bash(${c})`, `PowerShell(${c})`]);

export function providerSpecs(): Record<ProviderId, ProviderSpec> {
  return {
    claude: {
      id: 'claude', label: 'Claude Code', bin: firstExisting(process.env.RELAY_CLAUDE_BIN, claudeExe()),
      invocation: (prompt, { mode, resume }) => ({
        args: ['-p', '--output-format', 'stream-json', '--verbose', ...(resume ? ['--resume', resume] : []),
          '--permission-mode', mode === 'work' ? 'acceptEdits' : 'default',
          '--allowedTools', ...(mode === 'work' ? WORK_TOOLS : READ_TOOLS),
          '--disallowedTools', ...DENIED,
          '--model', DEFAULT_MODELS.claude.model, '--effort', DEFAULT_MODELS.claude.effort],
        stdin: prompt,
      }),
      checkSubscription(env) {
        if (!this.bin) return { ok: false, detail: 'không tìm thấy' };
        const r = run(this.bin, ['auth', 'status'], env);
        try {
          const s = JSON.parse(r.out) as { loggedIn?: boolean; authMethod?: string; subscriptionType?: string };
          const ok = s.loggedIn === true && s.authMethod === 'claude.ai';
          return { ok, detail: ok ? `claude.ai (${s.subscriptionType ?? '?'})` : `authMethod=${s.authMethod ?? 'none'}` };
        } catch { return { ok: false, detail: 'không đọc được auth status' }; }
      },
    },
    codex: {
      id: 'codex', label: 'Codex (ChatGPT)', bin: firstExisting(process.env.RELAY_CODEX_BIN, newestCodex(), where('codex.exe')[0]),
      invocation: (prompt, { cwd, mode, lastMessageFile, resume }) => {
        const sandbox = mode === 'work' ? 'workspace-write' : 'read-only';
        const common = ['--json', '-o', lastMessageFile, '-m', DEFAULT_MODELS.codex.model, '-c', `model_reasoning_effort="${DEFAULT_MODELS.codex.effort}"`];
        // `exec resume` has no --sandbox/-C flags: set the sandbox through config and run from the repo cwd.
        return {
          args: resume ? ['exec', 'resume', ...common, '-c', `sandbox_mode="${sandbox}"`, resume, '-']
            : ['exec', ...common, '--sandbox', sandbox, '-C', cwd, '--color', 'never', '-'],
          stdin: prompt, lastMessageFile,
        };
      },
      checkSubscription(env) {
        if (!this.bin) return { ok: false, detail: 'không tìm thấy' };
        const r = run(this.bin, ['login', 'status'], env);
        const ok = r.code === 0 && /ChatGPT/i.test(r.out);
        return { ok, detail: r.out.split(/\r?\n/)[0] ?? '' };
      },
    },
    agy: {
      // agy -p aborts the whole turn on the first shell command that has no allow rule (seen 20/10/2026), so steer it to
      // its own file tools and to exactly the commands allowed in ~/.gemini/antigravity-cli/settings.json.
      promptNote: [
        '## Quy tắc công cụ cho Antigravity (chế độ headless)',
        'Duyệt và đọc file bằng công cụ có sẵn: list_dir, find_by_name, grep_search, view_file; sửa bằng replace_file_content, multi_replace_file_content, write_to_file.',
        'run_command CHỈ dùng cho đúng các lệnh: `npm.cmd run check|lint|typecheck|test|build|spike` (có thể thêm tham số), `npx.cmd vitest ...`, `npx.cmd tsc ...`, `git status|diff|log|show ...`, `node --version`.',
        'Không dùng Get-ChildItem, Get-Content, Select-String, cat, ls, dir, pipe `|`, `;`, `&&` hay lệnh nào khác: lệnh ngoài danh sách bị từ chối và làm dừng cả lượt.',
      ].join('\n'),
      id: 'agy', label: 'Antigravity (Gemini)', bin: firstExisting(process.env.RELAY_AGY_BIN, join(LOCAL, 'agy', 'bin', 'agy.exe'), where('agy.exe')[0]),
      invocation: (prompt, { mode, resume }) => ({
        args: ['-p', prompt, '--output-format', 'stream-json', ...(resume ? ['--conversation', resume] : []), '--sandbox', '--mode', mode === 'work' ? 'accept-edits' : 'plan',
          '--model', DEFAULT_MODELS.agy.model],
        stdin: null,
      }),
      checkSubscription(env) {
        if (!this.bin) return { ok: false, detail: 'không tìm thấy' };
        // agy has no auth-status command; listing models proves a Google login without exposing credentials.
        const r = run(this.bin, ['models'], env);
        return r.code === 0 && /gemini/i.test(r.out)
          ? { ok: null, detail: 'đã đăng nhập Google (agy không báo loại gói; env API key đã bị gỡ)' }
          : { ok: false, detail: r.out.split(/\r?\n/).slice(-1)[0] ?? 'models thất bại' };
      },
    },
  };
}
