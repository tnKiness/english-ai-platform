// P5-3 Learner data export and storage report (D-07 independent part; E-28). Read-only: nothing is deleted or changed.
// The export holds what the learner wrote or was already shown: hints not yet unlocked, answer keys, knowledge content,
// AI account evidence and credentials are never written. One read transaction gives a consistent snapshot.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import type { Db } from '../sqlite/database.js';
import { canonicalJson, resolveContained, sha256, type DataPaths } from '../files/paths.js';

const LEARNER_ATTEMPTS = "attempt_id IN (SELECT attempt_id FROM attempts WHERE scope = 'learner')";

/** Every table in the export, its row filter and the columns deliberately left out. */
export const EXPORT_TABLES: { table: string; where?: string; omit?: string[]; why?: string }[] = [
  { table: 'learner_goals' },
  { table: 'attempts', where: "scope = 'learner'" },
  { table: 'evidence_sources', where: "scope = 'learner'" },
  { table: 'snapshots', where: LEARNER_ATTEMPTS },
  { table: 'submissions', where: LEARNER_ATTEMPTS },
  { table: 'assistance_events', where: LEARNER_ATTEMPTS },
  { table: 'assistance_impacts', where: `event_id IN (SELECT event_id FROM assistance_events WHERE ${LEARNER_ATTEMPTS})` },
  { table: 'writing_diagnoses', where: LEARNER_ATTEMPTS, omit: ['hints_json'], why: 'gợi ý sinh sẵn chưa chắc đã mở; gợi ý đã hiển thị được ghi bằng hash trong assistance_events' },
  { table: 'writing_loop_states', where: LEARNER_ATTEMPTS },
  { table: 'error_hypotheses', where: LEARNER_ATTEMPTS },
  { table: 'observations', where: "scope = 'learner'" },
  { table: 'learner_complaints', where: LEARNER_ATTEMPTS },
  { table: 'reading_sessions', where: LEARNER_ATTEMPTS },
  { table: 'reading_results', where: `submission_id IN (SELECT submission_id FROM submissions WHERE ${LEARNER_ATTEMPTS})` },
  { table: 'audio_sessions', where: LEARNER_ATTEMPTS },
  { table: 'audio_recordings', where: LEARNER_ATTEMPTS },
  { table: 'audio_transcripts', where: `recording_id IN (SELECT recording_id FROM audio_recordings WHERE ${LEARNER_ATTEMPTS})` },
  { table: 'exposure_events' },
  { table: 'scheduled_tasks' },
  { table: 'plan_versions' },
  { table: 'replan_proposals' },
  { table: 'daily_study_logs' },
  { table: 'study_activity_events' },
  { table: 'notification_outbox' },
  { table: 'ai_data_consents' },
];

/** Stated in the manifest so the reader knows what is absent on purpose. */
export const EXPORT_EXCLUSIONS = [
  'Nội dung gói tri thức, đề, rubric, đáp án: chỉ có tham chiếu id/version/hash trong attempts, observations (kho JSON không phải dữ liệu cá nhân, đáp án không được lộ).',
  'Gợi ý sinh sẵn chưa mở (writing_diagnoses.hints_json).',
  'Bài làm dry-run của Builder & QC (scope dry_run).',
  'Tài khoản AI, bằng chứng D-01, xác nhận extra usage, nhật ký hạn mức, job/run AI và đầu ra thô của CLI.',
];

export interface ExportManifest {
  format: 'study-english-learner-export'; format_version: 1; created_at: string; schema_version: number;
  tables: Record<string, { rows: number; file: string; sha256: string; omitted_columns: string[] }>;
  media: { media_id: string; file: string; sha256: string; bytes: number; media_type: string }[];
  excluded: string[];
}

function columns(db: Db, table: string): string[] {
  const cols = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name);
  if (!cols.length) throw new Error(`Export: table ${table} is missing`);
  return cols;
}

/**
 * Writes `<parent>/learner-export-<time>/` (data/*.json, media/*, manifest.json, DOC_TRUOC.txt). The folder is built
 * as `.partial` and renamed only when every file and checksum is written, so a half export is never mistaken for one.
 */
export function exportLearnerData(db: Db, paths: DataPaths, opts: { parentDir?: string; now?: () => Date } = {}): { dir: string; manifest: ExportManifest } {
  const now = (opts.now ?? (() => new Date()))();
  const parent = resolve(opts.parentDir ?? join(paths.root, 'exports'));
  const name = `learner-export-${now.toISOString().replace(/[:.]/g, '-')}`;
  const partial = join(parent, `${name}.partial`);
  const final = join(parent, name);
  if (existsSync(final) || existsSync(partial)) throw new Error(`Export target already exists: ${final}`);
  mkdirSync(join(partial, 'data'), { recursive: true });
  mkdirSync(join(partial, 'media'), { recursive: true });
  try {
    const manifest = db.transaction(() => {
      const m: ExportManifest = { format: 'study-english-learner-export', format_version: 1, created_at: now.toISOString(),
        schema_version: (db.prepare('SELECT MAX(version) AS v FROM schema_migrations').get() as { v: number }).v, tables: {}, media: [], excluded: EXPORT_EXCLUSIONS };
      for (const t of EXPORT_TABLES) {
        const cols = columns(db, t.table).filter((c) => !(t.omit ?? []).includes(c));
        const rows = db.prepare(`SELECT ${cols.map((c) => `"${c}"`).join(', ')} FROM ${t.table}${t.where ? ` WHERE ${t.where}` : ''} ORDER BY rowid`).all();
        const body = `${JSON.stringify(rows, null, 2)}\n`;
        const file = `data/${t.table}.json`;
        writeFileSync(join(partial, file), body, 'utf8');
        m.tables[t.table] = { rows: rows.length, file, sha256: sha256(body), omitted_columns: t.omit ?? [] };
      }
      const media = db.prepare(`SELECT m.media_id, m.rel_path, m.sha256, m.bytes, m.media_type FROM media_assets m
        WHERE m.media_id IN (SELECT media_id FROM audio_recordings WHERE ${LEARNER_ATTEMPTS}) ORDER BY m.created_at, m.media_id`).all() as
        { media_id: string; rel_path: string; sha256: string; bytes: number; media_type: string }[];
      for (const a of media) {
        const source = resolveContained(paths.media, a.rel_path, true);
        // The original is copied byte for byte and re-hashed: a changed file stops the export instead of being exported.
        if (sha256(readFileSync(source)) !== a.sha256) throw new Error(`Media ${a.media_id} does not match its recorded checksum`);
        const file = `media/${a.sha256}${extname(a.rel_path) || ''}`;
        copyFileSync(source, join(partial, file));
        m.media.push({ media_id: a.media_id, file, sha256: a.sha256, bytes: a.bytes, media_type: a.media_type });
      }
      return m;
    })();
    writeFileSync(join(partial, 'manifest.json'), `${canonicalJson(manifest)}\n`, 'utf8');
    writeFileSync(join(partial, 'DOC_TRUOC.txt'), [
      'Bản xuất dữ liệu học tập cá nhân (Study English).',
      'Chứa bài làm, bản thu âm và lịch sử học của bạn: giữ riêng tư, không đưa lên Git hay dịch vụ công khai.',
      'manifest.json liệt kê từng file kèm SHA-256 và những gì cố ý không xuất.',
      '',
    ].join('\n'), 'utf8');
    renameSync(partial, final);
    return { dir: final, manifest };
  } catch (error) {
    rmSync(partial, { recursive: true, force: true });
    throw error;
  }
}

/** Bytes under a path (files only; symlinks/junctions are not followed). */
function sizeOf(path: string): number {
  if (!existsSync(path)) return 0;
  const st = statSync(path, { throwIfNoEntry: false });
  if (!st) return 0;
  if (st.isFile()) return st.size;
  if (!st.isDirectory()) return 0;
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    total += sizeOf(join(path, entry.name));
  }
  return total;
}

/**
 * Where the disk space under `var/` goes, free space on that drive and the largest tables (D-07 input). Read-only:
 * no retention rule exists yet, so nothing is ever deleted from here.
 */
export function storageUsage(db: Db, paths: DataPaths) {
  const root = paths.root;
  const dbFiles = [paths.db, `${paths.db}-wal`, `${paths.db}-shm`];
  const areas: Record<string, number> = { database: dbFiles.reduce((s, f) => s + sizeOf(f), 0) };
  for (const entry of existsSync(root) ? readdirSync(root, { withFileTypes: true }) : []) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === 'db') continue;
    areas[entry.name] = sizeOf(join(root, entry.name));
  }
  const fsInfo = statfsSync(root);
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'knowledge_search_%'").all() as { name: string }[])
    .map((t) => ({ table: t.name, rows: (db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get() as { n: number }).n }))
    .sort((a, b) => b.rows - a.rows).slice(0, 10);
  const total = Object.values(areas).reduce((s, n) => s + n, 0);
  return {
    root, total_bytes: total, areas,
    disk: { free_bytes: Number(fsInfo.bavail) * Number(fsInfo.bsize), total_bytes: Number(fsInfo.blocks) * Number(fsInfo.bsize) },
    largest_tables: tables,
    retention: { policy: 'none', note: 'Chưa có chính sách lưu giữ (D-07): hệ thống không tự xóa dữ liệu. Báo cáo này chỉ để bạn quyết định.' },
  };
}

/** An export written inside the repository but outside var/ could be committed by accident. */
export function unsafeExportParent(parent: string, repoRoot: string, dataRoot: string): boolean {
  const inside = (base: string, p: string) => { const r = relative(resolve(base), resolve(p)); return r === '' || (!r.startsWith('..') && !r.includes(`..${sep}`) && !/^[A-Za-z]:/.test(r)); };
  return inside(repoRoot, parent) && !inside(dataRoot, parent);
}
