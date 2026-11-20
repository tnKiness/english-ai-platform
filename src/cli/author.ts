// Content authoring CLI (E-42, D-05 C2). Real AI calls happen only when the learner runs this command; they go
// through the gateway (verified subscription CLIs, no paid API fallback). Run from the repository root.
import { AuthoringError, FrameworkAuthoringService } from '../application/authoring/framework-authoring.js';
import { ItemAuthoringService, type ItemStatus } from '../application/authoring/item-authoring.js';
import { loadFrameworkPolicy, loadFrameworkSources, loadItemPolicy } from '../infrastructure/authoring/framework-sources.js';
import { gatewayAuthoringExecutor } from '../infrastructure/authoring/gateway-executor.js';
import { dataPaths } from '../infrastructure/files/paths.js';
import { builderPipeline, openStore } from '../infrastructure/sqlite/store.js';

const USAGE = `Cách dùng: npm.cmd run author -- <lệnh>
  framework [--no-review] [--revise <version>]
                            AI soạn khung năng lực + rubric Writing Task 2 từ nguồn đã duyệt, rồi một lượt AI khác rà soát;
                            --revise v1: soạn lại theo góp ý rà soát và lỗi kiểm tra của v1
  review <version>          chạy lại lượt AI rà soát cho một bản nháp (ví dụ v1)
  sources                   liệt kê nguồn sẽ gửi cho AI (không gọi AI)
  list                      các phiên bản khung và trạng thái
  items [--count <n>]       C3: AI soạn n đề Writing Task 2 (mặc định 5) theo khung ĐÃ DUYỆT; ứng dụng kiểm tra, đóng gói,
                            chạy QC1–3, một lượt AI khác rà soát (QC2/QC3 ngữ nghĩa + QC4); đề đạt đủ được tự phát hành
  items-review <batch_id>   chạy lại lượt AI rà soát cho các đề của một lô chưa có QC4 (ví dụ khi lượt trước lỗi)
  items-list                các lô đề và trạng thái từng đề
Duyệt hoặc loại bản nháp khung ở Console → tab "Khung năng lực"; đề đã phát hành xem ở cùng tab, thu hồi ở tab Gói tri thức.`;

const [command, arg] = process.argv.slice(2);
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));

async function main(): Promise<number> {
  if (!command || !['framework', 'review', 'sources', 'list', 'items', 'items-review', 'items-list'].includes(command)) { console.log(USAGE); return command ? 1 : 0; }
  const store = await openStore(dataPaths());
  try {
    const policy = loadFrameworkPolicy();
    const service = new FrameworkAuthoringService(store, policy, () => loadFrameworkSources(store.db, store.paths, policy));
    if (command === 'sources') {
      const s = loadFrameworkSources(store.db, store.paths, policy);
      for (const x of s.sources) console.log(`${x.role.padEnd(18)} ${x.source_ref}  ${x.url}  (${x.band_table ? `${x.band_table.length} ô bảng` : `${x.text?.length ?? 0} ký tự${x.truncated ? ', đã cắt' : ''}`})`);
      for (const m of s.missing) console.log(`THIẾU              ${m}`);
      return s.missing.length ? 2 : 0;
    }
    if (command === 'list') {
      for (const r of service.list()) console.log(`${r.version}\t${r.state}\tlỗi ${r.check_errors} · cảnh báo ${r.check_warnings}\t${r.review_run_id ? 'đã rà soát' : 'chưa rà soát'}\t${r.created_at}`);
      return 0;
    }
    const items = new ItemAuthoringService(store, builderPipeline(store), () => service.approved(), loadItemPolicy());
    const printItems = (rows: ItemStatus[]) => {
      for (const s of rows) {
        const state = s.precheck === 'rejected' ? 'loại ở kiểm tra tự động' : s.release_state === 'active' ? 'ĐÃ PHÁT HÀNH' : `${s.release_state ?? '-'} · ${s.qc.map((q) => `${q.stage}:${q.status}`).join(' ')}`;
        console.log(`  ${s.item_id}  [${s.genre}] ${s.topic} — ${state}${s.release_reasons.length ? ` (${s.release_reasons.join(', ')})` : ''}`);
      }
    };
    if (command === 'items-list') {
      for (const b of items.list()) {
        console.log(`${b.batch_id}  ${b.created_at}  khung ${b.framework_version}  ${b.provider}${b.model ? ` (${b.model})` : ''}  ${b.items} đề: ${b.active} phát hành, ${b.draft} nháp, ${b.rejected} bị loại`);
        printItems(items.status(b.batch_id));
      }
      console.log(`Lượt gọi AI sinh đề hôm nay: ${items.callsToday()}/${loadItemPolicy().daily_ai_call_cap}`);
      return 0;
    }
    const executor = gatewayAuthoringExecutor(store);
    if (command === 'items') {
      const ci = process.argv.indexOf('--count');
      const count = ci >= 0 ? Number(process.argv[ci + 1]) : undefined;
      if (ci >= 0 && !(Number.isInteger(count) && count! >= 1 && count! <= 10)) { console.log('--count phải là số nguyên 1–10'); return 1; }
      console.log('AI đang soạn đề Writing Task 2 rồi một lượt AI khác rà soát (có thể mất vài phút)…');
      const r = await items.author(executor, count);
      console.log(`Lô ${r.batch_id}:`);
      printItems(r.items);
      return 0;
    }
    if (command === 'items-review') {
      if (!arg) { console.log(USAGE); return 1; }
      const r = await items.review(executor, arg);
      console.log(r.run_id ? `Đã rà soát ${r.reviewed} đề, phát hành ${r.released} (lần chạy ${r.run_id}).` : 'Không có đề nào đang chờ rà soát trong lô này.');
      printItems(items.status(arg));
      return 0;
    }
    if (command === 'review') {
      if (!arg) { console.log(USAGE); return 1; }
      console.log(`AI đang rà soát ${arg}…`);
      const r = await service.review(executor, arg);
      console.log(`Rà soát xong: ${r.verdict === 'pass' ? 'đạt' : 'cần sửa'} · ${r.errors} lỗi, ${r.warnings} cảnh báo (lần chạy ${r.run_id}).`);
      return 0;
    }
    const ri = process.argv.indexOf('--revise');
    const reviseFrom = ri >= 0 ? process.argv[ri + 1] : undefined;
    if (ri >= 0 && !reviseFrom) { console.log(USAGE); return 1; }
    console.log(reviseFrom ? `AI đang soạn lại từ ${reviseFrom} theo góp ý rà soát (có thể mất vài phút)…` : 'AI đang soạn khung năng lực Writing Task 2 (có thể mất vài phút)…');
    const a = await service.author(executor, reviseFrom);
    const doc = service.document(a.version);
    console.log(`Bản nháp ${a.version}: ${doc.competencies.length} năng lực, provider ${doc.author.provider}${doc.author.model ? ` (${doc.author.model})` : ''}. Kiểm tra tự động: ${a.checks.errors} lỗi, ${a.checks.warnings} cảnh báo.`);
    for (const f of a.checks.findings.slice(0, 15)) console.log(`  [${f.severity}] ${f.code} ${f.target}: ${f.detail}`);
    if (!flags.has('--no-review')) {
      console.log('AI thứ hai đang rà soát bản nháp…');
      const r = await service.review(executor, a.version);
      console.log(`Rà soát: ${r.verdict === 'pass' ? 'đạt' : 'cần sửa'} · ${r.errors} lỗi, ${r.warnings} cảnh báo.`);
    }
    console.log('Mở Console → "Khung năng lực" để đọc và duyệt.');
    return 0;
  } catch (e) {
    console.error(e instanceof AuthoringError ? e.message : e instanceof Error ? e.message : String(e));
    return 1;
  } finally { store.close(); }
}
process.exitCode = await main();
