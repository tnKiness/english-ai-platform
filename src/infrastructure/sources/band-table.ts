// E-42: column-aware reconstruction of the official band descriptor tables (05 §5.B step 2: keep the table
// structure). The line text of a PDF interleaves the four criterion columns; here every text item is placed in a
// cell instead:
// - columns start at the x of the criterion headers on that page;
// - rows are the whole-band labels in the left margin. The boundary between two rows is the table's own ruling line
//   between the two labels when the PDF has exactly one there (E-46); otherwise the largest empty horizontal strip
//   (no text in any column) between them — a fallback that can misplace a line when one column runs long.
// - a row whose text never starts at the left edge of columns 2..n is a merged cell (e.g. Band 0) and stays one cell.
// The result is a reading aid for the authoring AI and the haystack for quote checks; it is not a source of truth
// beyond the PDF itself.
import type { PdfItem, PdfRule } from './pdf-text.js';

export interface BandCell { page: number; band: number; criterion: string; text: string }
export interface BandTable { page: number; criteria: string[]; bands: number[]; cells: BandCell[]; row_bounds: 'ruling_lines' | 'whitespace' }
export const ALL_CRITERIA = 'All criteria';

const HEADER = /^(Task Achievement|Task Response|Coherence (&|and) Cohesion|Lexical Resource|Grammatical Range (&|and)|Fluency (&|and) Coherence|Pronunciation)/i;
const CRITERION_NAMES: [RegExp, string][] = [
  [/^Task Achievement/i, 'Task Achievement'], [/^Task Response/i, 'Task Response'], [/^Coherence/i, 'Coherence and Cohesion'],
  [/^Lexical/i, 'Lexical Resource'], [/^Grammatical/i, 'Grammatical Range and Accuracy'], [/^Fluency/i, 'Fluency and Coherence'], [/^Pronunciation/i, 'Pronunciation'],
];

/** Joins the items of one cell top-to-bottom, left-to-right; repairs the " - " the PDF leaves inside hyphenated words. */
function cellText(items: PdfItem[]): string {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  return sorted.map((i) => i.str.trim()).filter(Boolean).join(' ').replace(/(\w) - (\w)/g, '$1-$2').replace(/\s+/g, ' ').replace(/\s+([.,;:!?)])/g, '$1').replace(/\(\s+/g, '(').trim();
}

export function reconstructBandTables(items: readonly PdfItem[], rules: readonly PdfRule[] = []): BandTable[] {
  const out: BandTable[] = [];
  for (const page of [...new Set(items.map((i) => i.page))].sort((a, b) => a - b)) {
    const its = items.filter((i) => i.page === page && i.str.trim() !== '');
    const heads = its.filter((i) => HEADER.test(i.str.trim())).sort((a, b) => a.x - b.x);
    if (heads.length < 2 || new Set(heads.map((h) => Math.round(h.y))).size !== 1) continue;
    const top = heads[0]!.y - 2;
    const labels = its.filter((i) => /^\d$/.test(i.str.trim()) && i.x < heads[0]!.x - 5 && i.y < top).sort((a, b) => b.y - a.y);
    if (labels.length === 0) continue;
    // Body: below the header block (headers may wrap onto a second line), right of the band-label margin.
    const body = its.filter((i) => i.y < top - 15 && !labels.includes(i) && i.x >= heads[0]!.x - 6);
    const spans = body.map((i) => [i.y, i.y + Math.max(i.h, 6)] as [number, number]).sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const s of spans) { const last = merged[merged.length - 1]; if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]); else merged.push([s[0], s[1]]); }
    const gaps: [number, number][] = [];
    for (let k = 1; k < merged.length; k += 1) gaps.push([merged[k - 1]![1], merged[k]![0]]);
    const tableWidth = Math.max(...body.map((i) => i.x + i.w)) - heads[0]!.x;
    const pageRules = rules.filter((r) => r.page === page && r.x1 - r.x0 >= tableWidth * 0.8);
    const ruled: number[] = [];
    for (let k = 0; k + 1 < labels.length; k += 1) {
      const between = pageRules.filter((r) => r.y < labels[k]!.y && r.y > labels[k + 1]!.y);
      if (between.length === 1) ruled.push(between[0]!.y);
    }
    const useRules = ruled.length === labels.length - 1;
    const bounds: number[] = useRules ? ruled : [];
    if (!useRules) for (let k = 0; k + 1 < labels.length; k += 1) {
      const hi = labels[k]!.y; const lo = labels[k + 1]!.y;
      const best = gaps.filter((g) => g[0] > lo - 20 && g[1] < hi + 20).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]))[0];
      bounds.push(best ? (best[0] + best[1]) / 2 : (hi + lo) / 2);
    }
    const bandOf = (y: number) => { let b = 0; while (b < bounds.length && y < bounds[b]!) b += 1; return Number(labels[b]!.str.trim()); };
    const colOf = (x: number) => { let c = 0; heads.forEach((h, k) => { if (x >= h.x - 6) c = k; }); return c; };
    const criteria = heads.map((h) => CRITERION_NAMES.find(([re]) => re.test(h.str.trim()))?.[1] ?? h.str.trim());
    const groups = new Map<string, PdfItem[]>();
    for (const i of body) {
      const key = `${bandOf(i.y)}|${colOf(i.x)}`;
      const g = groups.get(key);
      if (g) g.push(i); else groups.set(key, [i]);
    }
    const bands = labels.map((l) => Number(l.str.trim()));
    const cells: BandCell[] = [];
    for (const band of bands) {
      const rowItems = body.filter((i) => bandOf(i.y) === band);
      // Merged row: no line starts at the left edge of any column after the first.
      const merged = rowItems.length > 0 && !rowItems.some((i) => heads.slice(1).some((h) => Math.abs(i.x - h.x) <= 8));
      if (merged) { const text = cellText(rowItems); if (text) cells.push({ page, band, criterion: ALL_CRITERIA, text }); continue; }
      criteria.forEach((criterion, c) => {
        const text = cellText(groups.get(`${band}|${c}`) ?? []);
        if (text) cells.push({ page, band, criterion, text });
      });
    }
    out.push({ page, criteria, bands, cells, row_bounds: useRules ? 'ruling_lines' : 'whitespace' });
  }
  return out;
}
