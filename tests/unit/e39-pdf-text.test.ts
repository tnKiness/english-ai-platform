// E-39: PDF text extraction keeps table rows and columns apart (band descriptors are Band × criterion tables).
import { expect, it } from 'vitest';
import { extractPdfText, layoutLines } from '../../src/infrastructure/sources/pdf-text.js';
import { makePdf } from '../fixtures/make-pdf.js';

it('extracts text page by page, one line per row and a tab between columns', async () => {
  const r = await extractPdfText(makePdf([
    [{ x: 50, y: 700, text: 'Band 7' }, { x: 200, y: 700, text: 'presents a clear position' }, { x: 50, y: 680, text: 'Band 6' }, { x: 200, y: 680, text: 'presents a relevant position' }],
    [{ x: 50, y: 700, text: 'Second page (Task 2)' }],
  ]));
  expect(r.pages).toEqual(['Band 7\tpresents a clear position\nBand 6\tpresents a relevant position', 'Second page (Task 2)']);
  expect(r.text).toContain('--- Trang 2 ---');
  expect(r.items.filter((i) => i.page === 1)).toHaveLength(4);
});

it('joins words on one baseline and keeps nearby rows separate', () => {
  const it2 = (x: number, y: number, str: string, w = 20) => ({ page: 1, x, y, w, h: 10, str });
  expect(layoutLines([it2(10, 100, 'clear'), it2(31, 100.8, 'position'), it2(10, 88, 'next row'), it2(120, 100, 'col2')])).toEqual(['clear position\tcol2', 'next row']);
});

it('E-46: reports horizontal ruling lines (table row borders) with their page', async () => {
  const r = await extractPdfText(makePdf([[{ x: 50, y: 700, text: 'Band 7' }], [{ x: 50, y: 700, text: 'p2' }]], [[{ x0: 40, x1: 560, y: 650 }, { x0: 40, x1: 90, y: 600 }], [{ x0: 40, x1: 560, y: 300 }]]));
  expect(r.rules).toEqual([{ page: 1, y: 650, x0: 40, x1: 560 }, { page: 2, y: 300, x0: 40, x1: 560 }]); // short strokes are not table rules
});

it('rejects bytes that are not a PDF', async () => {
  await expect(extractPdfText(new TextEncoder().encode('<html>not a pdf</html>'))).rejects.toThrow();
});
