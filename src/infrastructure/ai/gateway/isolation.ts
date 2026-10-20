// Profile isolation and per-run sandbox (06A §3.B, §5.C.3). A clean directory is NOT a read boundary: the guard
// still requires the recorded file-scope test. These checks only prevent obvious mistakes in layout.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type { CliProvider } from '../../../application/ai/subscription-guard.js';

const within = (root: string, p: string) => { const r = relative(resolve(root), resolve(p)); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

/**
 * Candidate config-dir mechanisms per provider. A candidate is only a place to point the CLI; it becomes usable
 * when recorded evidence names the same mechanism and passed the file-scope test. null: none recorded → blocked.
 */
export const ISOLATION_MECHANISMS: Record<CliProvider, { env: string; source: string } | null> = {
  'claude-code': { env: 'CLAUDE_CONFIG_DIR', source: '06A §3.B [S3] — documented, not yet verified on this machine' },
  // E-11 (1): a dedicated CODEX_HOME outside the repo and var/ holds this profile's login and config.
  codex: { env: 'CODEX_HOME', source: 'E-11 (1) user decision — candidate, not yet verified on this machine' },
  agy: null,
};

/**
 * The runner (credential) directory must sit outside the repository, the learning data (incl. backups and logs)
 * and any sandbox, and none of those may sit inside it.
 */
export function profileIsolationIssues(runnerDir: string, forbidden: { repo: string; data: string; sandboxRoot: string }): string[] {
  const issues: string[] = [];
  if (!isAbsolute(runnerDir)) issues.push('RUNNER_DIR_NOT_ABSOLUTE');
  for (const [name, root] of Object.entries(forbidden)) {
    if (within(root, runnerDir)) issues.push(`RUNNER_DIR_INSIDE_${name.toUpperCase()}`);
    if (within(runnerDir, root)) issues.push(`${name.toUpperCase()}_INSIDE_RUNNER_DIR`);
  }
  return issues;
}

/** D01_CODEX_READ_BOUNDARY: user-created per-run root outside the repo, var/ and the user profile. */
export const DEFAULT_RUNNER_WORKSPACE = 'C:\\se-runner\\work';
/** The runner workspace once the user created it; otherwise the old %TEMP% root, which no boundary report matches. */
export function runnerWorkspace(): string {
  return existsSync(DEFAULT_RUNNER_WORKSPACE) ? DEFAULT_RUNNER_WORKSPACE : join(tmpdir(), 'study-english-sandbox');
}

const CONFIG_FILES =/^(AGENTS|CLAUDE|GEMINI)\.md$|^\.(claude|codex|gemini|agy|antigravity|git)$|\.(db|sqlite|db-wal|db-shm)$/i;

export interface RunSandbox { dir: string; tempDir: string; homeDir: string; dispose(): void }

/** Codex's elevated Windows sandbox runs model commands as members of this local group (probe, 20/10/2026). */
export const CODEX_SANDBOX_GROUP = 'CodexSandboxUsers';

/**
 * Explicit read grant for the sandbox group on this run's own dirs. E-17 puts an inheritable Deny on the runner root;
 * Codex does not grant the cwd in read-only mode, so without this the sandbox cannot even start
 * (CreateProcessWithLogonW 267, seen 20/10/2026). The run dir itself stays denied, so `..` remains blocked.
 */
export type SandboxGrant = (dirs: string[]) => void;
export function grantSandboxGroupRead(group: string, system = process.env.SystemRoot ?? 'C:\\Windows'): SandboxGrant {
  return (dirs) => {
    for (const d of dirs) {
      const r = spawnSync(join(system, 'System32', 'icacls.exe'), [d, '/grant', `${group}:(OI)(CI)(RX)`], { encoding: 'utf8', shell: false, windowsHide: true, timeout: 30_000 });
      if (r.status !== 0) throw new Error(`SANDBOX_GRANT_FAILED: ${d}: ${(r.stdout + r.stderr).trim().slice(0, 200)}`);
    }
  };
}

/** Fresh empty directory per run holding only the allowed files; refuses config/DB/answer-bank names. */
export function createRunSandbox(runId: string, files: { name: string; content: string }[], root = join(tmpdir(), 'study-english-sandbox'),
  opts: { grant?: SandboxGrant } = {}): RunSandbox {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(runId)) throw new Error('Unsafe run id for sandbox');
  const dir = join(root, runId);
  if (existsSync(dir)) throw new Error('Sandbox already exists for this run');
  const work = join(dir, 'work');
  const tempDir = join(dir, 'tmp');
  const homeDir = join(dir, 'home');
  for (const d of [work, tempDir, homeDir]) mkdirSync(d, { recursive: true });
  try { opts.grant?.([work, tempDir, homeDir]); } catch (error) { rmSync(dir, { recursive: true, force: true }); throw error; }
  for (const f of files) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(f.name) || CONFIG_FILES.test(f.name)) throw new Error(`File not allowed in sandbox: ${f.name}`);
    writeFileSync(join(work, f.name), f.content, { flag: 'wx' });
  }
  return { dir: work, tempDir, homeDir, dispose: () => rmSync(dir, { recursive: true, force: true }) };
}

/** Post-condition check: nothing but the allowed files (no links, no config) exists in the work dir. */
export function sandboxIssues(dir: string, allowed: string[]): string[] {
  const issues: string[] = [];
  for (const name of readdirSync(dir)) {
    if (!allowed.includes(name)) issues.push(`UNEXPECTED_FILE:${name}`);
    if (lstatSync(join(dir, name)).isSymbolicLink()) issues.push(`LINK:${name}`);
  }
  return issues;
}
