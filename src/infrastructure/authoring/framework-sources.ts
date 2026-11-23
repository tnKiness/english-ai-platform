// E-42 (D-05 C2): the reference data given to the authoring AI. Only pages the learner approved (Source Registry,
// rights decided in E-36) are used, listed explicitly in policies/authoring/*.json. The official band descriptor
// table is given cell by cell from the column-aware reconstruction (band-table.ts); other sources as plain text.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ItemPolicy } from '../../application/authoring/item-authoring.js';
import type { FrameworkRequirements, FrameworkSourceText } from '../../domain/knowledge/framework-checks.js';
import { parseScoredSamples, type ScoredSample } from '../../domain/knowledge/calibration.js';
import { resolveContained, type DataPaths } from '../files/paths.js';
import { reconstructBandTables } from '../sources/band-table.js';
import { sourcesDir } from '../sources/crawler.js';
import type { PdfItem, PdfRule } from '../sources/pdf-text.js';
import { htmlText } from '../sources/page.js';
import type { Db } from '../sqlite/database.js';

export interface FrameworkPolicy {
  schema_version: '1'; framework_id: string; decision: string; task: string; requirements: FrameworkRequirements; max_chars_per_source: number;
  /** E-52: exclude_criteria drops band-table columns the framework does not observe (Speaking text: Pronunciation). */
  band_table?: { url: string; first_criterion: string; exclude_criteria?: string[] };
  sources: { url: string; role: string }[];
}
export const WT2_POLICY_FILE = 'policies/authoring/wt2-framework.v1.json';
/** E-52: Speaking Parts 1–3 judged on text only (E-43). */
export const SPEAKING_POLICY_FILE = 'policies/authoring/speaking-framework.v1.json';
export const FRAMEWORK_POLICY_FILES: Record<string, string> = { writing: WT2_POLICY_FILE, speaking: SPEAKING_POLICY_FILE, listening: 'policies/authoring/listening-framework.v1.json' };
export function loadFrameworkPolicy(file = resolve(WT2_POLICY_FILE)): FrameworkPolicy {
  const p = JSON.parse(readFileSync(file, 'utf8')) as FrameworkPolicy;
  // E-54: Listening has no band descriptor table, so band_table is optional.
  if (p.schema_version !== '1' || !p.framework_id || !Array.isArray(p.sources) || !p.requirements) throw new Error(`${file}: invalid authoring policy`);
  return p;
}

/** E-47 (D-05 C3): limits for AI-authored Writing Task 2 prompts (N5, N8). */
export const WT2_ITEMS_POLICY_FILE = 'policies/authoring/wt2-items.v1.json';
export const ITEM_POLICY_FILES: Record<string, string> = { writing: WT2_ITEMS_POLICY_FILE, speaking: 'policies/authoring/speaking-items.v1.json' };
export function loadItemPolicy(file = resolve(WT2_ITEMS_POLICY_FILE)): ItemPolicy {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as ItemPolicy;
  const p: ItemPolicy = { ...raw, paragraph_min_words: raw.paragraph_min_words ?? 100, paragraph_minutes: raw.paragraph_minutes ?? 15, coverage: raw.coverage ?? { min_unseen: 3, min_families: 2, replenish_count: 5 } };
  const positive = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n > 0;
  if (p.schema_version !== '1' || !p.item_set_id || !positive(p.batch_size) || !positive(p.daily_ai_call_cap) || !(p.similarity_threshold > 0 && p.similarity_threshold <= 1)
    || !positive(p.min_prompt_words) || !positive(p.essay_min_words) || !Array.isArray(p.genres) || p.genres.length === 0 || !Array.isArray(p.usage_purposes) || p.usage_purposes.length === 0) {
    throw new Error(`${file}: invalid item authoring policy`);
  }
  return p;
}

export interface PayloadSource {
  source_ref: string; url: string; title: string; origin: string; role: string;
  text?: string; truncated?: boolean;
  band_table?: { band: number; criterion: string; locator: string; text: string }[];
}
export interface FrameworkSources { sources: PayloadSource[]; haystacks: FrameworkSourceText[]; missing: string[] }

interface Row { candidate_id: string; url: string; title: string | null; origin: string; content_type: string | null; stored_path: string | null; source_id: string | null; source_version: string | null }

export function loadFrameworkSources(db: Db, paths: DataPaths, policy: FrameworkPolicy): FrameworkSources {
  const find = db.prepare("SELECT candidate_id, url, title, origin, content_type, stored_path, source_id, source_version FROM source_candidates WHERE url = ? AND review_state = 'APPROVED' AND fetch_state = 'FETCHED'");
  const missing: string[] = [];
  const sources: PayloadSource[] = [];
  const haystacks: FrameworkSourceText[] = [];
  const dir = sourcesDir(paths);
  const meta = (r: Row, role: string) => ({ source_ref: `${r.source_id}@${r.source_version}`, url: r.url, title: r.title ?? r.url, origin: r.origin, role });

  // E-54: no band table for Listening.
  const bandTable = policy.band_table;
  if (bandTable) {
    const bt = find.get(bandTable.url) as Row | undefined;
    const layout = bt?.stored_path && bt.source_id ? resolveContained(dir, bt.stored_path.replace(/\.pdf$/, '.layout.json')) : null;
    if (!bt || !layout || !existsSync(layout)) missing.push(bandTable.url);
    else {
      const rulesFile = layout.replace(/\.layout\.json$/, '.rules.json');
      const rules = existsSync(rulesFile) ? JSON.parse(readFileSync(rulesFile, 'utf8')) as PdfRule[] : [];
      const tables = reconstructBandTables(JSON.parse(readFileSync(layout, 'utf8')) as PdfItem[], rules).filter((t) => t.criteria[0] === bandTable.first_criterion);
      const excluded = new Set(bandTable.exclude_criteria ?? []);
      const cells = tables.flatMap((t) => t.cells.filter((c) => !excluded.has(c.criterion)).map((c) => ({ band: c.band, criterion: c.criterion, locator: `trang ${c.page}, ${c.criterion}, Band ${c.band}`, text: c.text })));
      if (cells.length === 0) missing.push(`${bandTable.url} (không dựng được bảng ${bandTable.first_criterion})`);
      else {
        sources.push({ ...meta(bt, 'band_descriptors'), band_table: cells });
        haystacks.push({ source_ref: meta(bt, '').source_ref, texts: cells.map((c) => c.text) });
      }
    }
  }
  for (const s of policy.sources) {
    const r = find.get(s.url) as Row | undefined;
    if (!r || !r.stored_path || !r.source_id) { missing.push(s.url); continue; }
    const isPdf = r.content_type === 'application/pdf';
    const file = resolveContained(dir, isPdf ? r.stored_path.replace(/\.pdf$/, '.txt') : r.stored_path);
    if (!existsSync(file)) { missing.push(s.url); continue; }
    const full = isPdf ? readFileSync(file, 'utf8') : htmlText(readFileSync(file, 'utf8'));
    const text = full.slice(0, policy.max_chars_per_source);
    sources.push({ ...meta(r, s.role), text, truncated: full.length > text.length });
    haystacks.push({ source_ref: meta(r, '').source_ref, texts: [text] });
  }
  return { sources, haystacks, missing };
}

/** E-55 (C6): the official scored samples, parsed from the stored text of approved example-response PDFs. */
export function loadCalibrationSamples(db: Db, paths: DataPaths, file = resolve('policies/calibration-samples.v1.json')): { samples: ScoredSample[]; missing: string[] } {
  const policy = JSON.parse(readFileSync(file, 'utf8')) as { sources: string[] };
  const find = db.prepare("SELECT url, stored_path, source_id, source_version FROM source_candidates WHERE url = ? AND review_state = 'APPROVED' AND fetch_state = 'FETCHED'");
  const samples: ScoredSample[] = []; const missing: string[] = [];
  for (const url of policy.sources) {
    const r = find.get(url) as { url: string; stored_path: string | null; source_id: string | null; source_version: string | null } | undefined;
    const txt = r?.stored_path ? resolveContained(sourcesDir(paths), r.stored_path.replace(/\.pdf$/, '.txt')) : null;
    if (!r || !r.source_id || !txt || !existsSync(txt)) { missing.push(url); continue; }
    samples.push(...parseScoredSamples(readFileSync(txt, 'utf8'), { source_ref: `${r.source_id}@${r.source_version}`, url }));
  }
  return { samples, missing };
}

