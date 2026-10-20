// Verified entrypoint (D-04): spawn only an absolute native executable whose bytes match the recorded hash.
// npm shims (.cmd/.ps1/.bat) and scripts are refused: they route through cmd.exe/PowerShell quoting.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { extname, isAbsolute, relative, resolve } from 'node:path';

export interface EntrypointCheck { ok: boolean; path: string; real_path: string | null; sha256: string | null; issues: string[] }

const inside = (root: string, p: string) => { const r = relative(resolve(root), resolve(p)); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

export function verifyEntrypoint(path: string, opts: { forbiddenRoots: string[]; platform?: NodeJS.Platform }): EntrypointCheck {
  const issues: string[] = [];
  const platform = opts.platform ?? process.platform;
  if (!isAbsolute(path)) return { ok: false, path, real_path: null, sha256: null, issues: ['NOT_ABSOLUTE'] };
  if (!existsSync(path)) return { ok: false, path, real_path: null, sha256: null, issues: ['MISSING'] };
  const real = realpathSync(path);
  if (!statSync(real).isFile()) issues.push('NOT_A_FILE');
  const ext = extname(real).toLowerCase();
  if (['.cmd', '.bat', '.ps1', '.vbs', '.js', '.mjs', '.cjs', '.sh'].includes(ext)) issues.push('SHIM_OR_SCRIPT');
  else if (platform === 'win32' && ext !== '.exe') issues.push('NOT_NATIVE_EXE');
  if (real.toLowerCase() !== resolve(path).toLowerCase()) issues.push('LINK_REDIRECT');
  for (const root of opts.forbiddenRoots) if (inside(root, real)) issues.push('INSIDE_WORKSPACE_OR_DATA');
  const sha256 = issues.includes('NOT_A_FILE') ? null : createHash('sha256').update(readFileSync(real)).digest('hex');
  return { ok: issues.length === 0, path, real_path: real, sha256, issues };
}
