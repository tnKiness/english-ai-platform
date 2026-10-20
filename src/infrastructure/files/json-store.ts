import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Db } from '../sqlite/database.js';
import { assertSafeSegment, canonicalJson, resolveContained, sha256 } from './paths.js';

export type JsonKind = 'item' | 'rubric' | 'package' | 'knowledge' | 'policy';
export interface JsonRef { kind: JsonKind; id: string; version: string; hash: string; rel_path: string }

export class ImmutableVersionError extends Error {}
export class IntegrityError extends Error {}

/**
 * Immutable versioned JSON store (06 §5.B.1): files are the source of content, SQLite indexes path + hash.
 * A (kind, id, version) can be written once; re-putting identical content is idempotent, different content is rejected.
 */
export class JsonStore {
  constructor(private db: Db, private root: string, private stagingDir: string, private now: () => Date = () => new Date()) {}

  put(kind: JsonKind, id: string, version: string, value: unknown): JsonRef {
    assertSafeSegment(id, 'object id'); assertSafeSegment(version, 'version');
    const body = canonicalJson(value);
    const hash = sha256(body);
    const relPath = `${kind}/${id}/${version}.json`;
    const existing = this.find(kind, id, version);
    if (existing) {
      if (existing.hash !== hash) throw new ImmutableVersionError(`${kind}/${id}@${version} already exists with different content`);
      return existing;
    }
    const target = resolveContained(this.root, relPath);
    if (existsSync(target)) {
      // Orphan from a crash between file write and DB insert: only reuse it if it is byte-identical.
      if (sha256(readFileSync(target)) !== hash) throw new ImmutableVersionError(`Unindexed file with different content at ${relPath}`);
    } else {
      mkdirSync(dirname(target), { recursive: true });
      mkdirSync(this.stagingDir, { recursive: true });
      const tmp = join(this.stagingDir, `${randomUUID()}.json.tmp`);
      writeFileSync(tmp, body, { flag: 'wx' });
      renameSync(tmp, target);
    }
    this.db.prepare('INSERT INTO json_objects (kind, object_id, version, content_hash, rel_path, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(kind, id, version, hash, relPath, Buffer.byteLength(body), this.now().toISOString());
    return { kind, id, version, hash, rel_path: relPath };
  }

  find(kind: JsonKind, id: string, version: string): JsonRef | undefined {
    const row = this.db.prepare('SELECT content_hash AS hash, rel_path FROM json_objects WHERE kind = ? AND object_id = ? AND version = ?')
      .get(kind, id, version) as { hash: string; rel_path: string } | undefined;
    return row && { kind, id, version, hash: row.hash, rel_path: row.rel_path };
  }

  /** Reads and verifies the checksum; a caller-pinned hash must also match. */
  get(kind: JsonKind, id: string, version: string, expectedHash?: string): unknown {
    const ref = this.find(kind, id, version);
    if (!ref) throw new Error(`Unknown ${kind}/${id}@${version}`);
    if (expectedHash && expectedHash !== ref.hash) throw new IntegrityError(`Pinned hash mismatch for ${kind}/${id}@${version}`);
    const raw = readFileSync(resolveContained(this.root, ref.rel_path, true), 'utf8');
    if (sha256(raw) !== ref.hash) throw new IntegrityError(`Checksum mismatch for ${ref.rel_path}`);
    return JSON.parse(raw);
  }
}
