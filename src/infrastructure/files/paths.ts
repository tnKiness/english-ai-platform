import { createHash } from 'node:crypto';
import { mkdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Runtime data layout (gitignored `var/`). Tests pass a temporary root instead. */
export interface DataPaths { root: string; db: string; knowledge: string; media: string; staging: string; backups: string }

export function dataPaths(root = resolve('var')): DataPaths {
  const abs = resolve(root);
  return { root: abs, db: join(abs, 'db', 'study.db'), knowledge: join(abs, 'knowledge'), media: join(abs, 'media'), staging: join(abs, 'staging'), backups: join(abs, 'backups') };
}

export function ensureDataDirs(paths: DataPaths): void {
  for (const dir of [join(paths.root, 'db'), paths.knowledge, paths.media, paths.staging, paths.backups]) mkdirSync(dir, { recursive: true });
}

export function sha256(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
export function assertSafeSegment(value: string, label: string): void {
  if (!SEGMENT.test(value) || value.includes('..')) throw new Error(`Unsafe ${label}: ${JSON.stringify(value)}`);
}

/** Resolve a stored relative path under root; rejects absolute paths, `..` escapes and (when it exists) symlink/junction escapes. */
export function resolveContained(root: string, relPath: string, mustExist = false): string {
  if (isAbsolute(relPath) || relPath.includes('\0')) throw new Error('Stored path must be relative');
  const base = resolve(root);
  const target = resolve(base, relPath);
  const rel = relative(base, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`Path escapes store: ${relPath}`);
  if (mustExist) {
    const realBase = realpathSync(base);
    const realTarget = realpathSync(target);
    if (!realTarget.startsWith(realBase + sep)) throw new Error(`Path escapes store via link: ${relPath}`);
  }
  return target;
}

/** Stable JSON: object keys sorted recursively, so the same value always hashes the same. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]));
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Non-finite number in JSON content');
  return value;
}
