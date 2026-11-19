// Source crawler CLI (E-37, D-05 N2). Network: only the allowlisted domains in policies/source-seeds.v1.json.
// Pages are stored in var/sources and listed for review in Builder & QC → Nguồn; nothing is used until approved.
import { dataPaths } from '../infrastructure/files/paths.js';
import { extractPendingPdfs, loadSeedConfig, SourceCrawler } from '../infrastructure/sources/crawler.js';
import { openStore } from '../infrastructure/sqlite/store.js';

const USAGE = `Usage: npm run sources -- <command>
  crawl [--max-pages <n>]   fetch up to n queued pages (default 200) of the allowlisted source domains; run again to continue
  extract                   extract text + layout of fetched PDFs that have none yet (E-39)
  discover-audio            queue Listening audio linked from pages fetched before audio support (E-44); then run crawl
  status                    counts by fetch state, review state and kind`;

async function main(args: string[]): Promise<number> {
  const [command] = args;
  if (command !== 'crawl' && command !== 'status' && command !== 'extract' && command !== 'discover-audio') { console.log(USAGE); return command ? 1 : 0; }
  const store = await openStore(dataPaths());
  try {
    if (command === 'crawl') {
      const i = args.indexOf('--max-pages');
      const maxPages = i >= 0 ? Number(args[i + 1]) : 200;
      if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 5000) throw new Error('--max-pages phải là số nguyên 1–5000');
      const cfg = loadSeedConfig();
      console.log(`Quét tối đa ${maxPages} trang trong ${cfg.domains.length} miền cho phép (tôn trọng robots.txt, ${cfg.limits.min_interval_ms} ms giữa hai lần gọi cùng máy chủ).`);
      const r = await new SourceCrawler(store.db, store.paths, cfg).crawl({ maxPages, log: (l) => console.log(l) });
      console.log(`Xong: ${r.fetched} đã tải, ${r.skipped} bỏ qua, ${r.failed} lỗi, ${r.discovered} liên kết mới; ${r.excluded_from_queue} trang trong hàng đợi bị loại theo chính sách; còn ${r.queued_left} trang trong hàng đợi.`);
      console.log('Duyệt ở Builder & QC → Nguồn. Chạy lại lệnh để quét tiếp.');
      return 0;
    }
    if (command === 'discover-audio') {
      const n = new SourceCrawler(store.db, store.paths, loadSeedConfig()).discoverAudio();
      console.log(`Đã thêm ${n} file audio vào hàng đợi. Chạy \`npm.cmd run sources -- crawl\` để tải.`);
      return 0;
    }
    if (command === 'extract') {
      const r = await extractPendingPdfs(store.db, store.paths);
      console.log(`Đã trích chữ ${r.extracted} PDF, lỗi ${r.failed}.`);
      return 0;
    }
    const q = (sql: string) => store.db.prepare(sql).all() as { k: string | null; n: number }[];
    for (const [label, col] of [['Tải', 'fetch_state'], ['Duyệt', 'review_state'], ['Loại', 'kind'], ['Kiểu', "CASE WHEN content_type LIKE 'audio/%' THEN 'audio' WHEN content_type = 'application/pdf' THEN 'pdf' WHEN content_type IS NULL THEN NULL ELSE 'html' END"]] as const) {
      console.log(`${label}: ${q(`SELECT ${col} AS k, COUNT(*) AS n FROM source_candidates GROUP BY ${col} ORDER BY n DESC`).map((r) => `${r.k ?? '—'} ${r.n}`).join(' · ') || '(trống)'}`);
    }
    return 0;
  } finally { store.close(); }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; });
