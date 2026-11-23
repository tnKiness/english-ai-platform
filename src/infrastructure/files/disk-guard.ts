// E-53 (D-07, user decision 20/11/2026 "Cảnh báo + dọn bản sao nguồn"): what the app does when the disk holding var/
// runs low. Below WARN the learner is warned (Học hôm nay, CLI); below BLOCK new downloads (crawled pages/audio) and
// new TTS audio are refused, while writing, drafts, submissions and assessment keep working. Nothing is ever deleted
// automatically: pruneSourceCopies only runs when the learner asks for it, and only removes re-downloadable copies
// nobody uses (rejected pages and files no candidate references), never approved sources, learner audio or history.
import { existsSync, readdirSync, statfsSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { DataPaths } from './paths.js';
import type { Db } from '../sqlite/database.js';
import { sourcesDir } from '../sources/crawler.js';

const GiB = 1024 ** 3;
export const DISK_POLICY = { warn_free_bytes: 5 * GiB, block_free_bytes: 2 * GiB } as const;
export type DiskLevel = 'ok' | 'warn' | 'block';
export interface DiskStatus { free_bytes: number; total_bytes: number; level: DiskLevel; warn_free_bytes: number; block_free_bytes: number; message: string | null }

export function diskStatus(root: string, policy: { warn_free_bytes: number; block_free_bytes: number } = DISK_POLICY, statfs: (p: string) => { bavail: number | bigint; bsize: number | bigint; blocks: number | bigint } = statfsSync): DiskStatus {
  const s = statfs(existsSync(root) ? root : '.');
  const free = Number(s.bavail) * Number(s.bsize);
  const total = Number(s.blocks) * Number(s.bsize);
  const level: DiskLevel = free < policy.block_free_bytes ? 'block' : free < policy.warn_free_bytes ? 'warn' : 'ok';
  const gb = (n: number) => `${(n / GiB).toFixed(1)} GB`;
  const message = level === 'ok' ? null : level === 'warn'
    ? `Ổ đĩa chứa dữ liệu còn ${gb(free)} (dưới ${gb(policy.warn_free_bytes)}). Có thể dọn bản sao nguồn không dùng: npm.cmd run sources -- prune-copies`
    : `Ổ đĩa chỉ còn ${gb(free)} (dưới ${gb(policy.block_free_bytes)}): tạm dừng tải nguồn/audio mới và tạo audio TTS. Viết bài, nộp bài và chấm vẫn chạy. Dọn bớt: npm.cmd run sources -- prune-copies --apply`;
  return { free_bytes: free, total_bytes: total, level, ...policy, message };
}

export class DiskSpaceError extends Error {
  readonly code = 'DISK_LOW';
  readonly statusCode = 507;
  constructor(message: string) { super(message); }
}

/** Refuse a new download / generated media when the disk is in the block zone (D-07). */
export function assertCanStoreNew(root: string, what: string, status = diskStatus(root)): void {
  if (status.level === 'block') throw new DiskSpaceError(`Không ${what}: ${status.message}`);
}

/** Stored copy plus the files derived from it (PDF text, layout, ruling lines). */
const derived = (stored: string) => [stored, stored.replace(/\.pdf$/, '.txt'), stored.replace(/\.pdf$/, '.layout.json'), stored.replace(/\.pdf$/, '.rules.json')];

/**
 * Re-downloadable source copies nobody uses: files of REJECTED candidates and files no candidate references. Files of
 * approved or still pending candidates are kept (approved ones back the competency frameworks and their quotes).
 * Dry run unless `apply`. The candidate rows stay, so a rejected page is never queued again.
 */
export function pruneSourceCopies(db: Db, paths: DataPaths, apply = false): { files: number; bytes: number; rejected: number; orphans: number; deleted: boolean } {
  const dir = sourcesDir(paths);
  if (!existsSync(dir)) return { files: 0, bytes: 0, rejected: 0, orphans: 0, deleted: false };
  const rows = db.prepare('SELECT stored_path, review_state FROM source_candidates WHERE stored_path IS NOT NULL').all() as { stored_path: string; review_state: string }[];
  const keep = new Set(rows.filter((r) => r.review_state !== 'REJECTED').flatMap((r) => derived(r.stored_path)));
  const rejected = new Set(rows.filter((r) => r.review_state === 'REJECTED').flatMap((r) => derived(r.stored_path)));
  let files = 0; let bytes = 0; let rej = 0; let orphans = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || keep.has(entry.name)) continue;
    const full = join(dir, entry.name);
    files += 1; bytes += statSync(full).size;
    if (rejected.has(entry.name)) rej += 1; else orphans += 1;
    if (apply) unlinkSync(full);
  }
  return { files, bytes, rejected: rej, orphans, deleted: apply };
}
