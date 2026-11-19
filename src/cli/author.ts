// Content authoring CLI (E-42, D-05 C2). Real AI calls happen only when the learner runs this command; they go
// through the gateway (verified subscription CLIs, no paid API fallback). Run from the repository root.
import { AuthoringError, FrameworkAuthoringService } from '../application/authoring/framework-authoring.js';
import { loadFrameworkPolicy, loadFrameworkSources } from '../infrastructure/authoring/framework-sources.js';
import { gatewayAuthoringExecutor } from '../infrastructure/authoring/gateway-executor.js';
import { dataPaths } from '../infrastructure/files/paths.js';
import { openStore } from '../infrastructure/sqlite/store.js';

const USAGE = `Cách dùng: npm.cmd run author -- <lệnh>
  framework [--no-review] [--revise <version>]
                            AI soạn khung năng lực + rubric Writing Task 2 từ nguồn đã duyệt, rồi một lượt AI khác rà soát;
                            --revise v1: soạn lại theo góp ý rà soát và lỗi kiểm tra của v1
  review <version>          chạy lại lượt AI rà soát cho một bản nháp (ví dụ v1)
  sources                   liệt kê nguồn sẽ gửi cho AI (không gọi AI)
  list                      các phiên bản khung và trạng thái
Duyệt hoặc loại bản nháp ở Console → tab "Khung năng lực".`;

const [command, arg] = process.argv.slice(2);
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));

async function main(): Promise<number> {
  if (!command || !['framework', 'review', 'sources', 'list'].includes(command)) { console.log(USAGE); return command ? 1 : 0; }
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
    const executor = gatewayAuthoringExecutor(store);
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
