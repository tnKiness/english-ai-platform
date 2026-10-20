import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ProviderId } from './core.js';

export interface Invocation { args: string[]; stdin: string | null; lastMessageFile?: string }
export interface ProviderSpec {
  id: ProviderId; label: string; bin: string | null;
  /** mode 'work' may edit the workspace; 'smoke' is read-only. Never a sandbox/permission bypass flag. */
  invocation(prompt: string, opts: { cwd: string; mode: 'work' | 'smoke'; lastMessageFile: string }): Invocation;
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

const READ_TOOLS = ['Read', 'Glob', 'Grep'];
const WORK_TOOLS = [...READ_TOOLS, 'Edit', 'Write', 'Bash(npm.cmd run:*)', 'Bash(npm run:*)', 'Bash(npx.cmd tsx:*)',
  'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)', 'Bash(node --version)'];

export function providerSpecs(): Record<ProviderId, ProviderSpec> {
  return {
    claude: {
      id: 'claude', label: 'Claude Code', bin: firstExisting(process.env.RELAY_CLAUDE_BIN, claudeExe()),
      invocation: (prompt, { mode }) => ({
        args: ['-p', '--output-format', 'text',
          '--permission-mode', mode === 'work' ? 'acceptEdits' : 'default',
          '--allowedTools', ...(mode === 'work' ? WORK_TOOLS : READ_TOOLS),
          '--disallowedTools', 'Bash(git commit:*)', 'Bash(git push:*)',
          ...(process.env.RELAY_CLAUDE_MODEL ? ['--model', process.env.RELAY_CLAUDE_MODEL] : [])],
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
      invocation: (_prompt, { cwd, mode, lastMessageFile }) => ({
        args: ['exec', '--sandbox', mode === 'work' ? 'workspace-write' : 'read-only', '-C', cwd, '--color', 'never',
          '-o', lastMessageFile, ...(process.env.RELAY_CODEX_MODEL ? ['-m', process.env.RELAY_CODEX_MODEL] : []), '-'],
        stdin: _prompt, lastMessageFile,
      }),
      checkSubscription(env) {
        if (!this.bin) return { ok: false, detail: 'không tìm thấy' };
        const r = run(this.bin, ['login', 'status'], env);
        const ok = r.code === 0 && /ChatGPT/i.test(r.out);
        return { ok, detail: r.out.split(/\r?\n/)[0] ?? '' };
      },
    },
    agy: {
      id: 'agy', label: 'Antigravity (Gemini)', bin: firstExisting(process.env.RELAY_AGY_BIN, join(LOCAL, 'agy', 'bin', 'agy.exe'), where('agy.exe')[0]),
      invocation: (prompt, { mode }) => ({
        args: ['-p', prompt, '--output-format', 'text', '--sandbox', '--mode', mode === 'work' ? 'accept-edits' : 'plan',
          ...(process.env.RELAY_AGY_MODEL ? ['--model', process.env.RELAY_AGY_MODEL] : [])],
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
