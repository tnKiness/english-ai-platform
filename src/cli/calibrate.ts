// E-55 (D-05 C6, N9): qualitative check of the Writing Task 2 assessor on the official scored samples. `samples`
// lists what was parsed from the approved PDFs (no AI call); `run` assesses each Task 2 sample once through the
// gateway and writes a side-by-side Markdown report under var/reports (personal data area, never committed).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { AuthoringError, FrameworkAuthoringService } from '../application/authoring/framework-authoring.js';
import { CalibrationService, calibrationMarkdown } from '../application/authoring/calibration.js';
import { FRAMEWORK_POLICY_FILES, loadCalibrationSamples, loadFrameworkPolicy } from '../infrastructure/authoring/framework-sources.js';
import { gatewayAssessExecutor } from '../infrastructure/authoring/gateway-executor.js';
import { dataPaths } from '../infrastructure/files/paths.js';
import { openStore } from '../infrastructure/sqlite/store.js';

const USAGE = `Cách dùng: npm.cmd run calibrate -- <lệnh>
  samples   liệt kê bài mẫu có điểm + nhận xét giám khảo tách từ PDF chính thức đã duyệt (không gọi AI)
  run       chấm thử từng bài Task 2 bằng khung Writing đã duyệt (1 lượt gọi AI/bài) và ghi báo cáo đối chiếu
            định tính vào var/reports/calibration-<thời điểm>.md (không đặt ngưỡng, không tính Band)`;

async function main(command: string | undefined): Promise<number> {
  if (command !== 'samples' && command !== 'run') { console.log(USAGE); return command ? 1 : 0; }
  const store = await openStore(dataPaths());
  try {
    const fw = new FrameworkAuthoringService(store, loadFrameworkPolicy(resolve(FRAMEWORK_POLICY_FILES.writing!)), () => ({ sources: [], haystacks: [], missing: [] }));
    const svc = new CalibrationService(store, () => loadCalibrationSamples(store.db, store.paths), () => fw.approved());
    if (command === 'samples') {
      const { samples, missing } = svc.samples();
      for (const s of samples) console.log(`${s.sample_id}\t${s.module}\tTask ${s.task}\tBand ${s.band}\t${s.response.split(/\s+/).length} từ`);
      for (const m of missing) console.log(`THIẾU  ${m}`);
      console.log(`${samples.filter((s) => s.task === 2).length} bài Task 2 (N9 cần 20–30 trước khi có nhận định Band).`);
      return missing.length ? 2 : 0;
    }
    console.log('AI đang chấm thử các bài mẫu Task 2 (mỗi bài một lượt)…');
    const r = await svc.run(gatewayAssessExecutor(store));
    const dir = join(store.paths.root, 'reports');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `calibration-${r.created_at.replace(/[:.]/g, '-')}.md`);
    writeFileSync(file, calibrationMarkdown(r), 'utf8');
    for (const row of r.rows) console.log(`${row.sample_id}\tgiám khảo Band ${row.band}\t${row.assessed ? row.by_criterion.map((c) => `${c.criterion}: ${c.met}/${c.not_met}/${c.inconclusive}`).join(' · ') : `không chấm (${row.error})`}`);
    console.log(`Báo cáo (đạt/chưa đạt/chưa đủ kết luận theo tiêu chí): ${file}`);
    return 0;
  } catch (e) {
    console.error(e instanceof AuthoringError ? e.message : e instanceof Error ? e.message : String(e));
    return 1;
  } finally { store.close(); }
}
process.exitCode = await main(process.argv[2]);
