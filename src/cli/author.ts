// Content authoring CLI (E-42, D-05 C2). Real AI calls happen only when the learner runs this command; they go
// through the gateway (verified subscription CLIs, no paid API fallback). Run from the repository root.
import { AuthoringError, FrameworkAuthoringService } from '../application/authoring/framework-authoring.js';
import { ItemAuthoringService, type ItemStatus } from '../application/authoring/item-authoring.js';
import { LearnerItemService } from '../application/authoring/learner-items.js';
import { ListeningAuthoringService, type ListeningPolicy } from '../application/authoring/listening-authoring.js';
import { PiperTts } from '../infrastructure/audio/tts.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FRAMEWORK_POLICY_FILES, ITEM_POLICY_FILES, loadFrameworkPolicy, loadFrameworkSources, loadItemPolicy } from '../infrastructure/authoring/framework-sources.js';
import { gatewayAuthoringExecutor } from '../infrastructure/authoring/gateway-executor.js';
import { dataPaths } from '../infrastructure/files/paths.js';
import { builderPipeline, openStore } from '../infrastructure/sqlite/store.js';

const USAGE = `Cách dùng: npm.cmd run author -- <lệnh>
  (thêm --skill speaking vào framework / review / sources / list để làm khung Speaking dạng văn bản, E-52)
  framework [--no-review] [--revise <version>]
                            AI soạn khung năng lực + rubric Writing Task 2 từ nguồn đã duyệt, rồi một lượt AI khác rà soát;
                            --revise v1: soạn lại theo góp ý rà soát và lỗi kiểm tra của v1
  review <version>          chạy lại lượt AI rà soát cho một bản nháp (ví dụ v1)
  sources                   liệt kê nguồn sẽ gửi cho AI (không gọi AI)
  list                      các phiên bản khung và trạng thái
  items [--count <n>] [--paragraph] [--focus <id,id>]
                            C3: AI soạn n đề Writing Task 2 (mặc định 5) theo khung ĐÃ DUYỆT; ứng dụng kiểm tra, đóng gói,
                            chạy QC1–3, một lượt AI khác rà soát (QC2/QC3 ngữ nghĩa + QC4); đề đạt đủ được tự phát hành.
                            --paragraph: nhiệm vụ một đoạn cho 7A, mỗi đề nhắm đúng một năng lực; --focus: ưu tiên các năng lực này
  items-review <batch_id>   chạy lại lượt AI rà soát cho các đề của một lô chưa có QC4 (ví dụ khi lượt trước lỗi)
  items-list                các lô đề và trạng thái từng đề
  coverage                  độ phủ kho đề theo N8 (đề chưa xem, số họ đề, năng lực thiếu đề kiểm chứng); không gọi AI
  replenish                 C5: soạn thêm một lô cho mỗi ô thiếu đề, trong trần lượt gọi N8
  own-list                  C4: đề bạn đã nhập và trạng thái (chờ rà soát / đã vào kho / không đạt)
  own-review                C4: chạy lượt AI rà soát cho các đề bạn nhập đang chờ (cần đồng ý learner_owned_content)
  listening [--count <n>] [--part 1,2]
                            E-54: AI soạn n Part Listening (mặc định 2) theo khung Listening ĐÃ DUYỆT; Piper đọc thành audio;
                            AI khác giải mù trên transcript (QC4) và rà soát (QC2/QC3); đạt đủ thì tự phát hành (3 lượt gọi/lô)
  listening-review <batch_id>  chạy lại giải mù + rà soát cho các Part của lô chưa có QC4
  listening-list            các lô Listening và trạng thái từng Part
Duyệt hoặc loại bản nháp khung ở Console → tab "Khung năng lực"; đề đã phát hành xem ở cùng tab, thu hồi ở tab Gói tri thức.`;

const [command, arg] = process.argv.slice(2);
const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));

async function main(): Promise<number> {
  if (!command || !['framework', 'review', 'sources', 'list', 'items', 'items-review', 'items-list', 'coverage', 'replenish', 'own-list', 'own-review', 'listening', 'listening-review', 'listening-list'].includes(command)) { console.log(USAGE); return command ? 1 : 0; }
  const store = await openStore(dataPaths());
  try {
    // E-52: --skill speaking selects the Speaking text framework (framework, review, sources, list, approve in Console).
    const si = process.argv.indexOf('--skill');
    const skill = si >= 0 ? process.argv[si + 1] ?? '' : 'writing';
    if (!FRAMEWORK_POLICY_FILES[skill]) { console.log(`--skill phải là: ${Object.keys(FRAMEWORK_POLICY_FILES).join(', ')}`); return 1; }
    const policy = loadFrameworkPolicy(resolve(FRAMEWORK_POLICY_FILES[skill]));
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
    // Listening has its own item policy (listening-items.v1.json); the Writing/Speaking item commands fall back to Writing.
    const itemPolicy = loadItemPolicy(resolve(ITEM_POLICY_FILES[skill] ?? ITEM_POLICY_FILES.writing!));
    const items = new ItemAuthoringService(store, builderPipeline(store), () => service.approved(), itemPolicy);
    const printItems = (rows: ItemStatus[]) => {
      for (const s of rows) {
        const state = s.precheck === 'rejected' ? 'loại ở kiểm tra tự động' : s.release_state === 'active' ? 'ĐÃ PHÁT HÀNH' : `${s.release_state ?? '-'} · ${s.qc.map((q) => `${q.stage}:${q.status}`).join(' ')}`;
        console.log(`  ${s.item_id}  [${s.task_scope === 'paragraph' ? 'đoạn · ' : ''}${s.genre}] ${s.topic} — ${state}${s.release_reasons.length ? ` (${s.release_reasons.join(', ')})` : ''}`);
      }
    };
    if (command === 'items-list') {
      for (const b of items.list()) {
        console.log(`${b.batch_id}  ${b.created_at}  khung ${b.framework_version}  ${b.provider}${b.model ? ` (${b.model})` : ''}  ${b.items} đề: ${b.active} phát hành, ${b.draft} nháp, ${b.rejected} bị loại`);
        printItems(items.status(b.batch_id));
      }
      console.log(`Lượt gọi AI sinh đề (${skill}) hôm nay: ${items.callsToday()}/${itemPolicy.daily_ai_call_cap}`);
      return 0;
    }
    if (command.startsWith('listening')) {
      const lfw = new FrameworkAuthoringService(store, loadFrameworkPolicy(resolve(FRAMEWORK_POLICY_FILES.listening!)), () => ({ sources: [], haystacks: [], missing: [] }));
      const lis = new ListeningAuthoringService(store, builderPipeline(store), () => lfw.approved(), JSON.parse(readFileSync(resolve('policies/authoring/listening-items.v1.json'), 'utf8')) as ListeningPolicy);
      const show = (rows: ReturnType<typeof lis.status>) => { for (const s of rows) console.log(`  ${s.item_id}  [Part ${s.part}] ${s.topic} · ${s.questions} câu — ${s.precheck === 'rejected' ? 'loại ở kiểm tra tự động' : s.release_state === 'active' ? 'ĐÃ PHÁT HÀNH' : `${s.release_state ?? '-'} · ${s.qc.map((q) => `${q.stage}:${q.status}`).join(' ')}`}${s.release_reasons.length ? ` (${s.release_reasons.join(', ')})` : ''}`); };
      if (command === 'listening-list') {
        for (const b of lis.list()) { console.log(`${b.batch_id}  ${b.created_at}  ${b.items} Part: ${b.active} phát hành, ${b.draft} nháp, ${b.rejected} bị loại${b.checks.length ? ` · ${b.checks.join('; ')}` : ''}`); show(lis.status(b.batch_id)); }
        console.log(`Lượt gọi AI soạn Listening hôm nay: ${lis.callsToday()}`);
        return 0;
      }
      const ex = gatewayAuthoringExecutor(store);
      if (command === 'listening-review') {
        if (!arg) { console.log(USAGE); return 1; }
        const r = await lis.review(ex, arg);
        console.log(`Đã kiểm ${r.reviewed} Part, phát hành ${r.released}.`); show(lis.status(arg));
        return 0;
      }
      const ci = process.argv.indexOf('--count'); const pi = process.argv.indexOf('--part');
      const count = ci >= 0 ? Number(process.argv[ci + 1]) : undefined;
      const parts = pi >= 0 ? (process.argv[pi + 1] ?? '').split(',').map(Number).filter((n) => n >= 1 && n <= 4) : undefined;
      console.log('AI đang soạn Listening, Piper đọc thành audio, rồi giải mù và rà soát (có thể mất vài phút)…');
      const r = await lis.author(ex, new PiperTts(), count, parts);
      console.log(`Lô ${r.batch_id}:`); show(r.items);
      return 0;
    }
    const own = new LearnerItemService(store, builderPipeline(store), () => service.approved(), loadItemPolicy());
    if (command === 'own-list') {
      for (const x of own.list()) console.log(`${x.item_id}  [${x.genre}] ${x.topic} — ${x.state} · ${x.qc.map((q) => `${q.stage}:${q.status}`).join(' ')}${x.review_findings.length ? ` · ${x.review_findings.map((f) => `${f.check}/${f.severity}`).join(', ')}` : ''}`);
      return 0;
    }
    if (command === 'own-review') {
      const r = await own.reviewPending(gatewayAuthoringExecutor(store, undefined, ['learner_owned_content']));
      console.log(r.run_id ? `Đã rà soát ${r.reviewed} đề, vào kho ${r.released} (lần chạy ${r.run_id}).` : 'Không có đề nào đang chờ rà soát.');
      return 0;
    }
    if (command === 'coverage') {
      for (const x of items.coverage().cells) {
        console.log(`${x.task_scope === 'paragraph' ? 'Đề đoạn (7A)' : 'Bài luận (luyện tập, 7B, Bước 9)'}: ${x.unseen} đề chưa xem / cần ${x.min_unseen}; ${x.families} họ đề / cần ${x.min_families}${x.focus.length ? `; thiếu đề kiểm chứng cho ${x.focus.join(', ')}` : ''} — ${x.deficient ? 'THIẾU' : 'đủ'}`);
      }
      return 0;
    }
    const executor = gatewayAuthoringExecutor(store);
    if (command === 'replenish') {
      const r = await items.replenish(executor);
      for (const x of r.ran) { console.log(`Lô ${x.batch_id} (${x.task_scope}): phát hành ${x.released} đề`); printItems(items.status(x.batch_id)); }
      if (r.skipped.length) console.log(`Bỏ qua: ${r.skipped.join(', ')}`);
      if (!r.ran.length && !r.skipped.length) console.log('Kho đề đủ theo N8; không cần soạn thêm.');
      return 0;
    }
    if (command === 'items') {
      const ci = process.argv.indexOf('--count');
      const count = ci >= 0 ? Number(process.argv[ci + 1]) : undefined;
      if (ci >= 0 && !(Number.isInteger(count) && count! >= 1 && count! <= 10)) { console.log('--count phải là số nguyên 1–10'); return 1; }
      console.log(`AI đang soạn đề ${skill === 'speaking' ? 'Speaking' : 'Writing Task 2'} rồi một lượt AI khác rà soát (có thể mất vài phút)…`);
      const fi = process.argv.indexOf('--focus');
      const focus = fi >= 0 ? (process.argv[fi + 1] ?? '').split(',').map((x) => x.trim()).filter(Boolean) : undefined;
      const r = await items.author(executor, count, { task_scope: flags.has('--paragraph') ? 'paragraph' : 'essay', ...(focus ? { focus } : {}) });
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
    console.log(reviseFrom ? `AI đang soạn lại từ ${reviseFrom} theo góp ý rà soát (có thể mất vài phút)…` : `AI đang soạn khung năng lực ${policy.task.slice(0, 60)} (có thể mất vài phút)…`);
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
