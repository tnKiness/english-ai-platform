// Profile isolation and per-run sandbox (06A §3.B, §5.C.3). A clean directory is NOT a read boundary: the guard
// still requires the recorded file-scope test. These checks only prevent obvious mistakes in layout.
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

const CONFIG_FILES = /^(AGENTS|CLAUDE|GEMINI)\.md$|^\.(claude|codex|gemini|agy|antigravity|git)$|\.(db|sqlite|db-wal|db-shm)$/i;

export interface RunSandbox { dir: string; tempDir: string; homeDir: string; dispose(): void }

/** Fresh empty directory per run holding only the allowed files; refuses config/DB/answer-bank names. */
export function createRunSandbox(runId: string, files: { name: string; content: string }[], root = join(tmpdir(), 'study-english-sandbox')): RunSandbox {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(runId)) throw new Error('Unsafe run id for sandbox');
  const dir = join(root, runId);
  if (existsSync(dir)) throw new Error('Sandbox already exists for this run');
  const work = join(dir, 'work');
  const tempDir = join(dir, 'tmp');
  const homeDir = join(dir, 'home');
  for (const d of [work, tempDir, homeDir]) mkdirSync(d, { recursive: true });
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
