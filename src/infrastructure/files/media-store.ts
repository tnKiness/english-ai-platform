import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import type { Db } from '../sqlite/database.js';
import { IntegrityError } from './json-store.js';
import { resolveContained, sha256 } from './paths.js';

const EXTENSIONS: Record<string, string> = {
  'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/ogg': 'ogg',
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
};
export interface MediaRef { media_id: string; rel_path: string; sha256: string; bytes: number; media_type: string }

/** Content-addressed local media store: never overwrites or deletes; reads verify containment and checksum. */
export class MediaStore {
  constructor(private db: Db, private root: string, private stagingDir: string, private now: () => Date = () => new Date()) {}

  put(bytes: Uint8Array, mediaType: string): MediaRef {
    const ext = EXTENSIONS[mediaType];
    if (!ext) throw new Error(`Unsupported media type: ${mediaType}`);
    const hash = sha256(bytes);
    const existing = this.db.prepare('SELECT media_id, rel_path, sha256, bytes, media_type FROM media_assets WHERE sha256 = ?').get(hash) as MediaRef | undefined;
    if (existing) return existing;
    const relPath = `${hash.slice(0, 2)}/${hash}.${ext}`;
    const target = resolveContained(this.root, relPath);
    if (!existsSync(target) || sha256(readFileSync(target)) !== hash) {
      mkdirSync(dirname(target), { recursive: true });
      mkdirSync(this.stagingDir, { recursive: true });
      const tmp = join(this.stagingDir, `${randomUUID()}.media.tmp`);
      writeFileSync(tmp, bytes, { flag: 'wx' });
      renameSync(tmp, target);
    }
    const ref: MediaRef = { media_id: `media_${hash}`, rel_path: relPath, sha256: hash, bytes: bytes.byteLength, media_type: mediaType };
    this.db.prepare('INSERT INTO media_assets (media_id, rel_path, sha256, bytes, media_type, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(ref.media_id, ref.rel_path, ref.sha256, ref.bytes, ref.media_type, this.now().toISOString());
    return ref;
  }

  read(mediaId: string): Buffer {
    const ref = this.db.prepare('SELECT rel_path, sha256 FROM media_assets WHERE media_id = ?').get(mediaId) as { rel_path: string; sha256: string } | undefined;
    if (!ref) throw new Error(`Unknown media ${mediaId}`);
    const data = readFileSync(resolveContained(this.root, ref.rel_path, true));
    if (sha256(data) !== ref.sha256) throw new IntegrityError(`Checksum mismatch for media ${mediaId}`);
    return data;
  }
}
