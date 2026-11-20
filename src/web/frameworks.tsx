// Builder & QC → Khung năng lực (E-42, D-05 C2): read an AI-authored competency framework draft — automatic checks,
// the independent AI review, every competency with its evidence contract and exact source quotes, and the official
// band descriptors copied from the source table — then approve or reject it. The AI itself runs from `npm run author`.
import { useCallback, useEffect, useState } from 'react';
import { get, post } from './api.js';

interface Row { version: string; state: string; check_errors: number; check_warnings: number; review_run_id: string | null; created_at: string; decided_at: string | null; decision_note: string | null }
interface Run { run_id: string; task_type: string; target_version: string | null; provider: string; model: string | null; ok: number; error: string | null; started_at: string; finished_at: string }
interface Finding { code?: string; severity: 'error' | 'warning'; target: string; detail?: string; issue?: string; suggestion?: string }
interface Competency {
  competency_id: string; criterion: string; title_vi: string; assessor_criterion: string; target_claim: string; evidence_required: string[]; evidence_conditions: string[];
  confounders: string[]; inference_limits: string[]; edges: { type: string; target: string; basis: string | null }[]; source_quotes: { source_ref: string; quote: string }[];
}
interface Detail {
  row: Row;
  document: {
    version: string; task: string; author: { provider: string; model: string | null; cli_version: string | null; synthetic: boolean }; revised_from?: { version: string } | null;
    sources: { source_ref: string; url: string; title: string; role: string }[]; competencies: Competency[];
    rubric: { official: { criterion: string; band: number; locator: string; descriptor: string }[]; observation_guide: { competency_id: string; signal: string; counter_evidence: string[]; valid_exceptions: string[]; inconclusive_when: string[] }[]; aggregation: { notes: string[] } };
    limitations: string[]; checks: { errors: number; warnings: number; findings: Finding[] };
  };
  review: { provider: string; model: string | null; result: { verdict: 'pass' | 'revise'; findings: Finding[]; limitations: string[] } } | null;
}

interface Batch { batch_id: string; created_at: string; framework_version: string; provider: string; model: string | null; items: number; rejected: number; active: number; draft: number }
interface ItemStatus { item_id: string; package_id: string; item_key: string; genre: string; topic: string; competencies: string[]; precheck: 'passed' | 'rejected'; release_state: string | null; qc: { stage: string; status: string }[] }
interface BatchDetail {
  batch: { batch_id: string; framework: { version: string }; author: { provider: string; model: string | null }; checks: { code: string; severity: string; item_key: string; detail: string }[]; limitations: string[] };
  items: ItemStatus[]; reviews: { run_id: string; provider: string; result: { items: { item_key: string; verdict: string; findings: { check: string; severity: string; issue: string }[] }[] } }[];
  calls_today: number; daily_cap: number;
}
const GENRE: Record<string, string> = { opinion: 'Ý kiến', discussion: 'Thảo luận hai quan điểm', advantages_disadvantages: 'Lợi/hại', problem_solution: 'Vấn đề/giải pháp', two_part: 'Hai câu hỏi' };
const RELEASE: Record<string, string> = { active: 'Đã phát hành', draft: 'Chưa đạt QC (nháp)', suspended: 'Tạm ngừng', retired: 'Đã ngừng' };

const STATE: Record<string, string> = { DRAFT: 'Bản nháp', APPROVED: 'Đã duyệt', REJECTED: 'Đã loại', SUPERSEDED: 'Đã thay thế' };
const CRITERIA: [string, string][] = [['task_response', 'Task Response'], ['coherence_cohesion', 'Coherence & Cohesion'], ['lexical_resource', 'Lexical Resource'], ['grammatical_range_accuracy', 'Grammatical Range & Accuracy']];
const EDGE: Record<string, string> = { component_of: 'thành phần của', supports: 'hỗ trợ cho', prerequisite: 'tiên quyết của', transferable_to: 'chuyển giao sang', confusable_with: 'dễ nhầm với' };

const List = ({ title, items }: { title: string; items: string[] }) => items.length === 0 ? null : <><b>{title}</b><ul>{items.map((x, i) => <li key={i}>{x}</li>)}</ul></>;
const Findings = ({ items }: { items: Finding[] }) => items.length === 0 ? <p>Không có.</p> : <ul>{items.map((f, i) =>
  <li key={i}><b>{f.severity === 'error' ? 'Lỗi' : 'Cảnh báo'}</b> · <span className="mono">{f.code ? `${f.code} · ` : ''}{f.target}</span>: {f.detail ?? f.issue}{f.suggestion ? <> — <i>Đề xuất:</i> {f.suggestion}</> : null}</li>)}</ul>;

export function FrameworksPanel({ onError }: { onError: (e: unknown) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState('');
  const [batches, setBatches] = useState<{ batches: Batch[]; calls_today: number }>({ batches: [], calls_today: 0 });
  const [batch, setBatch] = useState<BatchDetail | null>(null);

  const load = useCallback(() => {
    get<{ rows: Row[]; runs: Run[] }>('/api/console/frameworks').then((d) => { setRows(d.rows); setRuns(d.runs); }).catch(onError);
    get<{ batches: Batch[]; calls_today: number }>('/api/console/item-batches').then(setBatches).catch(onError);
  }, [onError]);
  useEffect(load, [load]);
  const open = (version: string) => get<Detail>(`/api/console/frameworks/${encodeURIComponent(version)}`).then((d) => { setDetail(d); setNote(''); setStatus(''); }).catch(onError);
  const decide = (decision: 'approve' | 'reject') => {
    if (!detail) return;
    post<Row>(`/api/console/frameworks/${encodeURIComponent(detail.row.version)}/decision`, { decision, note })
      .then((r) => { setStatus(`${r.version}: ${STATE[r.state] ?? r.state}.`); load(); return open(r.version); }).catch(onError);
  };

  const openBatch = (id: string) => get<BatchDetail>(`/api/console/item-batches/${encodeURIComponent(id)}`).then(setBatch).catch(onError);
  const doc = detail?.document;
  const sourceUrl = (ref: string) => doc?.sources.find((s) => s.source_ref === ref);
  return <div>
    <section className="card">
      <h3>Khung năng lực Writing Task 2 (D-05 C2)</h3>
      <p>AI soạn danh mục năng lực và rubric từ các nguồn bạn đã duyệt; một lượt AI khác rà soát độc lập; ứng dụng kiểm tra tự động (mỗi trích dẫn phải có nguyên văn trong nguồn). Bạn đọc và quyết định. Chạy AI bằng:</p>
      <pre className="mono">npm.cmd run author -- framework</pre>
      <p>Phần "chuẩn gốc" của rubric (mô tả từng Band) được chép từ bảng band descriptors chính thức, không do AI viết. Khung không đặt ngưỡng Band; báo Band vẫn tắt (N9).</p>
      {rows.length === 0 ? <p>Chưa có bản nháp nào.</p> : <table><thead><tr><th>Phiên bản</th><th>Trạng thái</th><th>Kiểm tra tự động</th><th>AI rà soát</th><th>Tạo lúc</th><th></th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.version}><td className="mono">{r.version}</td><td>{STATE[r.state] ?? r.state}</td><td>{r.check_errors} lỗi · {r.check_warnings} cảnh báo</td>
          <td>{r.review_run_id ? 'Có' : 'Chưa'}</td><td>{new Date(r.created_at).toLocaleString('vi-VN')}</td><td><button onClick={() => { void open(r.version); }}>Xem</button></td></tr>)}
      </tbody></table>}
      {runs.length > 0 && <details><summary>Các lần gọi AI ({runs.length})</summary><ul>{runs.map((r) =>
        <li key={r.run_id} className="mono">{r.started_at} · {r.task_type} {r.target_version ?? ''} · {r.provider}{r.model ? ` (${r.model})` : ''} · {r.ok ? 'thành công' : `lỗi: ${r.error ?? ''}`}</li>)}</ul></details>}
    </section>

    <section className="card">
      <h3>Đề Writing Task 2 do AI soạn (D-05 C3)</h3>
      <p>AI soạn đề theo khung <b>đã duyệt</b>; ứng dụng kiểm tra (năng lực có trong khung, không ép cấu trúc, không gợi ý sẵn, không trùng gần với đề đã có), đóng gói, chạy QC1–3; một lượt AI khác rà soát (QC2/QC3 ngữ nghĩa và QC4). Đề đạt đủ QC1–QC4 được <b>tự phát hành</b> cho luyện tập và kiểm chứng (N6). Thu hồi ở tab Gói tri thức. Chạy:</p>
      <pre className="mono">npm.cmd run author -- items</pre>
      <p>Lượt gọi AI sinh đề hôm nay: {batches.calls_today} (trần theo N8). Độ khó chỉ là <i>ước tính</i>.</p>
      {batches.batches.length === 0 ? <p>Chưa có lô đề nào.</p> : <table><thead><tr><th>Lô</th><th>Khung</th><th>Đề</th><th>Phát hành</th><th>Nháp</th><th>Bị loại</th><th>Tạo lúc</th><th></th></tr></thead><tbody>
        {batches.batches.map((b) => <tr key={b.batch_id}><td className="mono">{b.batch_id.slice(0, 8)}</td><td>{b.framework_version}</td><td>{b.items}</td><td>{b.active}</td><td>{b.draft}</td><td>{b.rejected}</td>
          <td>{new Date(b.created_at).toLocaleString('vi-VN')}</td><td><button onClick={() => { void openBatch(b.batch_id); }}>Xem</button></td></tr>)}
      </tbody></table>}
    </section>

    {batch && <section className="card">
      <div className="actions"><h3>Lô {batch.batch.batch_id.slice(0, 8)} — khung {batch.batch.framework.version} · {batch.batch.author.provider}{batch.batch.author.model ? ` (${batch.batch.author.model})` : ''}</h3><button onClick={() => setBatch(null)}>Đóng</button></div>
      {batch.items.map((i) => {
        const review = batch.reviews.flatMap((r) => r.result.items).filter((x) => x.item_key === i.item_key).at(-1);
        const checks = batch.batch.checks.filter((c) => c.item_key === i.item_key);
        return <details key={i.item_id}>
          <summary><b>{GENRE[i.genre] ?? i.genre}</b> · {i.topic} — {i.precheck === 'rejected' ? 'Bị loại ở kiểm tra tự động' : RELEASE[i.release_state ?? ''] ?? i.release_state} {i.qc.length > 0 && <span className="mono">({i.qc.map((q) => `${q.stage}:${q.status}`).join(' ')})</span>}</summary>
          <p className="mono">{i.package_id} · {i.competencies.length} năng lực đo</p>
          <p>Nguyên văn đề không hiện ở đây: xem đề là một lần tiếp xúc. Muốn đọc, mở gói này ở tab Gói tri thức → Xem nội dung (được ghi nhật ký tiếp xúc, đề đã xem không dùng làm bài kiểm chứng độc lập).</p>
          {checks.length > 0 && <ul>{checks.map((c, k) => <li key={k}><b>{c.severity === 'error' ? 'Lỗi' : 'Cảnh báo'}</b> · {c.code}: {c.detail}</li>)}</ul>}
          {review && <><b>AI rà soát: {review.verdict === 'pass' ? 'đạt' : 'không đạt'}</b>{review.findings.length > 0 && <ul>{review.findings.map((x, k) => <li key={k}>{x.severity === 'error' ? 'Lỗi' : 'Cảnh báo'} · {x.check}: {x.issue}</li>)}</ul>}</>}
        </details>;
      })}
      <List title="Giới hạn AI soạn nêu" items={batch.batch.limitations} />
    </section>}

    {detail && doc && <>
      <section className="card">
        <div className="actions"><h3>{doc.task} — {doc.version} ({STATE[detail.row.state] ?? detail.row.state})</h3><button onClick={() => setDetail(null)}>Đóng</button></div>
        <p>Soạn bởi <b>{doc.author.provider}</b>{doc.author.model ? ` · ${doc.author.model}` : ''}{doc.author.synthetic ? ' · SYNTHETIC (không duyệt được)' : ''} · {doc.competencies.length} năng lực{doc.revised_from ? ` · soạn lại từ ${doc.revised_from.version} theo góp ý rà soát` : ''}.</p>
        <h4>Kiểm tra tự động: {doc.checks.errors} lỗi, {doc.checks.warnings} cảnh báo</h4>
        <Findings items={doc.checks.findings} />
        <h4>AI rà soát độc lập{detail.review ? ` (${detail.review.provider}): ${detail.review.result.verdict === 'pass' ? 'đạt' : 'cần sửa'}` : ': chưa có'}</h4>
        {detail.review ? <><Findings items={detail.review.result.findings} /><List title="Giới hạn người rà soát nêu" items={detail.review.result.limitations} /></> : <p className="mono">npm.cmd run author -- review {doc.version}</p>}
        <List title="Giới hạn AI soạn nêu" items={doc.limitations} />
        {detail.row.state === 'DRAFT' ? <div>
          <label>Ghi chú quyết định (bắt buộc nếu AI rà soát báo lỗi mà bạn vẫn duyệt)<br /><textarea rows={3} style={{ width: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="actions"><button onClick={() => decide('approve')}>Duyệt bản này</button><button onClick={() => decide('reject')}>Loại bản này</button></div>
        </div> : <p>Quyết định lúc {detail.row.decided_at}{detail.row.decision_note ? ` — ${detail.row.decision_note}` : ''}.</p>}
        <p role="status">{status}</p>
      </section>

      {CRITERIA.map(([key, label]) => <section className="card" key={key}>
        <h3>{label}</h3>
        {doc.competencies.filter((c) => c.criterion === key).map((c) => {
          const guide = doc.rubric.observation_guide.find((g) => g.competency_id === c.competency_id);
          return <details key={c.competency_id}>
            <summary><b>{c.title_vi}</b> <span className="mono">{c.competency_id}</span></summary>
            <p><i>Tiêu chí cho người chấm:</i> {c.assessor_criterion}</p>
            <p><i>Nhận định mục tiêu:</i> {c.target_claim}</p>
            <List title="Bằng chứng cần có" items={c.evidence_required} />
            <List title="Điều kiện tạo bằng chứng" items={c.evidence_conditions} />
            <List title="Yếu tố gây nhiễu" items={c.confounders} />
            <List title="Giới hạn suy luận" items={c.inference_limits} />
            <List title="Liên kết" items={c.edges.map((e) => `${EDGE[e.type] ?? e.type} ${e.target}${e.basis ? ` (căn cứ: ${e.basis})` : ''}`)} />
            <b>Trích dẫn nguồn</b><ul>{c.source_quotes.map((q, i) => { const s = sourceUrl(q.source_ref); return <li key={i}>“{q.quote}” — {s ? <a href={s.url} target="_blank" rel="noopener noreferrer nofollow">{s.title}</a> : <span className="mono">{q.source_ref}</span>}</li>; })}</ul>
            {guide && <><b>Hướng dẫn quan sát</b><p>{guide.signal}</p><List title="Phản chứng" items={guide.counter_evidence} /><List title="Ngoại lệ hợp lệ" items={guide.valid_exceptions} /><List title="Chưa đủ kết luận khi" items={guide.inconclusive_when} /></>}
          </details>;
        })}
      </section>)}

      <section className="card">
        <h3>Rubric — cách tổng hợp nhận định</h3>
        <List title="" items={doc.rubric.aggregation.notes} />
        <details><summary>Chuẩn gốc: band descriptors chính thức ({doc.rubric.official.length} ô, chép từ nguồn)</summary>
          <table><thead><tr><th>Band</th><th>Tiêu chí</th><th>Mô tả chính thức</th></tr></thead><tbody>
            {doc.rubric.official.map((o, i) => <tr key={i}><td>{o.band}</td><td>{o.criterion}</td><td>{o.descriptor}</td></tr>)}
          </tbody></table>
        </details>
      </section>
    </>}
  </div>;
}
