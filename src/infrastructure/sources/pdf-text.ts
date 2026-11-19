// PDF text extraction for source documents (E-39). Band descriptors are tables (Band × criterion), so the layout is
// kept: text items are grouped into lines by their y position and columns are separated by a tab when there is a wide
// horizontal gap (05 §5.B step 2: guard against shifting rows/columns). The PDF is untrusted data: pdfjs 6 has no eval
// path (checked: no `new Function` in the build), XFA is off,
// no fonts are loaded from the system and nothing is rendered.
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';

export interface PdfItem { page: number; x: number; y: number; w: number; h: number; str: string }
/** E-46: a horizontal ruling line of a table (PDF units, same space as the text items). */
export interface PdfRule { page: number; y: number; x0: number; x1: number }
export interface PdfText { pages: string[]; items: PdfItem[]; rules: PdfRule[]; text: string }

/** Horizontal lines/thin rectangles of one page, from the path bounding boxes pdfjs reports (nothing is rendered). */
function horizontalRules(page: number, fnArray: number[], argsArray: unknown[]): PdfRule[] {
  const out = new Map<string, PdfRule>();
  fnArray.forEach((fn, i) => {
    if (fn !== OPS.constructPath) return;
    const args = argsArray[i] as unknown[] | undefined;
    const mm = args?.[args.length - 1] as ArrayLike<number> | null | undefined;
    if (!mm || mm.length !== 4) return;
    const [x0, y0, x1, y1] = [mm[0]!, mm[1]!, mm[2]!, mm[3]!];
    if (![x0, y0, x1, y1].every(Number.isFinite) || x1 - x0 < 100 || y1 - y0 > 3) return;
    const rule = { page, y: Math.round(((y0 + y1) / 2) * 10) / 10, x0: Math.round(x0), x1: Math.round(x1) };
    out.set(`${rule.y}|${rule.x0}|${rule.x1}`, rule);
  });
  return [...out.values()].sort((a, b) => b.y - a.y);
}

/** Gap (in PDF units) between two items on one line above which they are treated as different columns. */
const COLUMN_GAP = 14;
/** Items whose baselines differ by less than this are on the same line. */
const LINE_TOLERANCE = 2.5;

export function layoutLines(items: readonly PdfItem[]): string[] {
  const lines: { y: number; parts: PdfItem[] }[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const line = lines.find((l) => Math.abs(l.y - it.y) < LINE_TOLERANCE);
    if (line) line.parts.push(it); else lines.push({ y: it.y, parts: [it] });
  }
  return lines.sort((a, b) => b.y - a.y).map((l) => {
    const parts = l.parts.sort((a, b) => a.x - b.x);
    let out = '';
    let end = -Infinity;
    for (const p of parts) {
      const gap = p.x - end;
      out += out === '' ? p.str : gap > COLUMN_GAP ? `\t${p.str}` : gap > 0.5 && !out.endsWith(' ') && !p.str.startsWith(' ') ? ` ${p.str}` : p.str;
      end = p.x + p.w;
    }
    return out.replace(/[ \u00a0]+/g, ' ').trimEnd();
  }).filter((s) => s.trim() !== '');
}

export async function extractPdfText(bytes: Uint8Array, opts: { maxPages?: number } = {}): Promise<PdfText> {
  const task = getDocument({ data: new Uint8Array(bytes), enableXfa: false, useSystemFonts: false, disableFontFace: true, stopAtErrors: false, verbosity: 0 });
  const loadingTaskDestroy = () => task.destroy();
  const doc = await task.promise;
  try {
    const count = Math.min(doc.numPages, opts.maxPages ?? 200);
    const pages: string[] = [];
    const all: PdfItem[] = [];
    const rules: PdfRule[] = [];
    for (let n = 1; n <= count; n += 1) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const items: PdfItem[] = [];
      for (const raw of content.items) {
        // pdfjs adds whitespace-only filler items across gaps; drop them so a wide gap still reads as a column break.
        if (!('str' in raw) || raw.str.trim() === '') continue;
        const t = raw.transform as number[];
        items.push({ page: n, x: t[4]!, y: t[5]!, w: raw.width, h: raw.height, str: raw.str });
      }
      all.push(...items);
      const ops = await page.getOperatorList();
      rules.push(...horizontalRules(n, ops.fnArray, ops.argsArray));
      pages.push(layoutLines(items).join('\n'));
      page.cleanup();
    }
    return { pages, items: all, rules, text: pages.map((p, i) => `--- Trang ${i + 1} ---\n${p}`).join('\n\n') };
  } finally { await loadingTaskDestroy(); }
}
