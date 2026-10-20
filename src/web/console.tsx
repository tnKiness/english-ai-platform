// Builder & QC Console (06 §3): three tabs, metadata by default. Content opens only on an explicit, confirmed click,
// and the server records the exposure before returning it. React escapes all text; nothing is injected as HTML.
import { useCallback, useEffect, useState } from 'react';
import { get, post, requestId } from './api.js';

interface Stage { stage: string; status: 'PASS' | 'FAIL' | 'NOT_RUN'; parts: { part: string; status: string; method: string; stale: boolean }[] }
interface Pkg {
  package_id: string; version: string; state: string; content_origin: string; usage_rights: string; bundle_hash: string; released_at: string | null;
  qc: Stage[]; units: { kind: string; id: string; version: string; unit_type: string }[]; grants: { usage_role: string; granted: boolean; blocked_reasons: string[] }[] | null; release_ready: boolean;
}
interface Review { review_id: string; kind: string; severity: string; summary: string; target_kind: string; target_id: string; target_version: string | null; created_at: string }
interface Run { job_id: string; task_type: string; scope: string; state: string; executions_used: number; role: string; input_hash: string; context_bytes: number; last_error: string | null; created_at: string;
  runs: { run_id: string; provider: string; cli_version: string | null; model: string | null; state: string; error: string | null; duration_ms: number | null }[] }
interface Gateway { provider: string; ready: boolean; error: string | null; reasons: string[] }

const LABEL: Record<string, string> = { PASS: 'Đạt', FAIL: 'Chưa đạt', NOT_RUN: 'Chưa chạy' };

function Packages({ onError }: { onError: (e: unknown) => void }) {
  const [list, setList] = useState<Pkg[]>([]);
  const [content, setContent] = useState<{ title: string; body: string } | null>(null);
  const [note, setNote] = useState<string>('');
  const load = useCallback(() => { get<Pkg[]>('/api/console/packages').then(setList).catch(onError); }, [onError]);
  useEffect(load, [load]);
  const act = (fn: () => Promise<unknown>, after?: (r: unknown) => void) => fn().then((r) => { after?.(r); load(); }).catch(onError);
  const base = (p: Pkg) => `/api/console/packages/${encodeURIComponent(p.package_id)}/${encodeURIComponent(p.version)}`;
  return <div>
    {list.length === 0 && <p>Chưa có gói nào được đóng băng.</p>}
    {list.map((p) => <article key={`${p.package_id}@${p.version}`} className="card">
      <h3>{p.package_id}@{p.version} <span className={`tag ${p.state}`}>{p.state}</span> {p.content_origin === 'synthetic_fixture' && <span className="tag">synthetic</span>}</h3>
      <p className="mono">bundle {p.bundle_hash.slice(0, 16)}… · quyền nguồn: {p.usage_rights}</p>
      <table><tbody>{p.qc.map((s) => <tr key={s.stage}><th>{s.stage}</th><td className={s.status}>{LABEL[s.status]}</td>
        <td>{s.parts.map((x) => `${x.part}: ${LABEL[x.status] ?? x.status}${x.method !== '-' ? ` (${x.method})` : ''}${x.stale ? ' — hết hiệu lực' : ''}`).join(' · ')}</td></tr>)}</tbody></table>
      {p.grants && <p>Vai trò được cấp: {p.grants.map((g) => `${g.usage_role} ${g.granted ? '✓' : `✗ (${g.blocked_reasons.join(', ')})`}`).join(' · ')}</p>}
      <div className="actions">
        <button onClick={() => act(() => post(`${base(p)}/qc/checks`))}>Chạy QC1–3 (xác định)</button>
        <input placeholder="Ghi chú xác nhận ngữ nghĩa" value={note} onChange={(e) => setNote(e.target.value)} />
        {(['QC2', 'QC3'] as const).map((stage) => <button key={stage} disabled={note.trim().length < 3}
          onClick={() => act(() => post(`${base(p)}/qc/attest`, { stage, status: 'PASS', bundle_hash: p.bundle_hash, note }))}>Xác nhận {stage} trên hash này</button>)}
        <button onClick={() => act(() => post(`${base(p)}/qc/qc4/start`))}>Bắt đầu QC4</button>
        <button onClick={() => act(() => post(`${base(p)}/qc/qc4/advance`))}>Cập nhật QC4</button>
        <button disabled={!p.release_ready} title={p.release_ready ? '' : 'Cần QC1–QC4 đạt trên đúng hash này'}
          onClick={() => act(() => post<{ allowed: boolean; reasons?: string[] }>(`${base(p)}/release`, { bundle_hash: p.bundle_hash }), (r) => {
            const out = r as { allowed: boolean; reasons?: string[] }; if (!out.allowed) onError(new Error(`Chặn phát hành: ${out.reasons?.join(', ')}`)); })}>Phát hành</button>
        {p.state === 'active' && <button onClick={() => act(() => post(`${base(p)}/withdraw`, { to: 'suspended', reason: 'Ngừng từ Console' }))}>Ngừng sử dụng</button>}
        {p.state === 'suspended' && <button onClick={() => act(() => post(`${base(p)}/withdraw`, { to: 'retired', reason: 'Loại bỏ từ Console' }))}>Loại bỏ</button>}
      </div>
      <details><summary>Đơn vị trong gói (chỉ metadata)</summary><ul>{p.units.map((u) => <li key={`${u.kind}/${u.id}`}>{u.unit_type} — {u.id}@{u.version}{' '}
        <button onClick={() => {
          if (!window.confirm('Mở nội dung sẽ ghi nhận bạn đã tiếp xúc (đề/đáp án/lời giải). Bài liên quan có thể mất giá trị kiểm chứng độc lập. Tiếp tục?')) return;
          act(() => post<{ content: unknown; exposure: { level: string }[] }>(`${base(p)}/content`, { unit: { kind: u.kind, id: u.id, version: u.version }, request_id: requestId() }),
            (r) => { const out = r as { content: unknown; exposure: { level: string }[] }; setContent({ title: `${u.id}@${u.version} — tiếp xúc: ${out.exposure.map((e) => e.level).join(', ') || 'không gắn bài'}`, body: JSON.stringify(out.content, null, 2) }); });
        }}>Xem nội dung / đáp án chi tiết</button></li>)}</ul></details>
    </article>)}
    {content && <section className="card"><h3>{content.title}</h3><pre>{content.body}</pre><button onClick={() => setContent(null)}>Đóng</button></section>}
  </div>;
}

function Issues({ onError }: { onError: (e: unknown) => void }) {
  const [data, setData] = useState<{ reviews: Review[]; jobs: { job_id: string; task_type: string; state: string; last_error: string | null }[] }>({ reviews: [], jobs: [] });
  const load = useCallback(() => { get<typeof data>('/api/console/issues').then(setData).catch(onError); }, [onError]);
  useEffect(load, [load]);
  const resolve = (id: string, resolution: string) => post(`/api/console/issues/${id}/resolve`, { resolution }).then(load).catch(onError);
  return <div>
    {data.reviews.length === 0 && data.jobs.length === 0 && <p>Không có việc cần xử lý.</p>}
    {data.reviews.map((r) => <article key={r.review_id} className={`card sev-${r.severity}`}>
      <h3>{r.summary}</h3><p className="mono">{r.kind} · {r.target_kind} {r.target_id}@{r.target_version ?? '*'} · {r.created_at}</p>
      <div className="actions">
        <button onClick={() => resolve(r.review_id, 'ai_fix_and_requalify')}>AI sửa &amp; QC lại (tạo version mới)</button>
        <button onClick={() => resolve(r.review_id, 'suspended_or_retired')}>Đã ngừng sử dụng</button>
        <button onClick={() => resolve(r.review_id, 'manual_review_done')}>Đã xem xét thủ công</button>
        <button onClick={() => resolve(r.review_id, 'deferred')}>Hoãn</button>
      </div></article>)}
    {data.jobs.length > 0 && <table><thead><tr><th>Job</th><th>Loại</th><th>Trạng thái</th><th>Lỗi</th></tr></thead><tbody>
      {data.jobs.map((j) => <tr key={j.job_id}><td className="mono">{j.job_id.slice(0, 8)}</td><td>{j.task_type}</td><td>{j.state}</td><td>{j.last_error}</td></tr>)}</tbody></table>}
  </div>;
}

function Runs({ onError }: { onError: (e: unknown) => void }) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [gateway, setGateway] = useState<Gateway[]>([]);
  useEffect(() => { get<Run[]>('/api/console/runs').then(setRuns).catch(onError); get<Gateway[]>('/api/console/gateway').then(setGateway).catch(onError); }, [onError]);
  return <div>
    <section className="card"><h3>Gateway AI thuê bao</h3><ul>{gateway.map((g) => <li key={g.provider}><b>{g.provider}</b>: {g.ready ? 'Sẵn sàng' : `Bị chặn (${g.error})`}
      {!g.ready && <span className="mono"> — {g.reasons.join(', ')}</span>}</li>)}</ul></section>
    <table><thead><tr><th>Thời điểm</th><th>Loại</th><th>Phạm vi</th><th>Trạng thái</th><th>Lượt chạy</th><th>Ngữ cảnh</th><th>Lỗi</th></tr></thead><tbody>
      {runs.map((j) => <tr key={j.job_id}><td>{j.created_at}</td><td>{j.task_type} ({j.role})</td><td>{j.scope}</td><td>{j.state}</td>
        <td>{j.runs.map((r) => `${r.provider}${r.cli_version ? ` ${r.cli_version}` : ''} ${r.state}${r.duration_ms !== null ? ` ${r.duration_ms}ms` : ''}`).join('; ')}</td>
        <td className="mono">{j.input_hash.slice(0, 12)}… {j.context_bytes}B</td><td>{j.last_error}</td></tr>)}</tbody></table>
  </div>;
}

export function BuilderConsole() {
  const [tab, setTab] = useState<'packages' | 'issues' | 'runs'>('packages');
  const [error, setError] = useState<string | null>(null);
  const onError = useCallback((e: unknown) => setError(e instanceof Error ? e.message : String(e)), []);
  return <section className="console">
    <nav className="tabs">{([['packages', 'Gói tri thức'], ['issues', 'Cần xử lý'], ['runs', 'Lần chạy']] as const).map(([k, label]) =>
      <button key={k} className={tab === k ? 'active' : ''} onClick={() => { setError(null); setTab(k); }}>{label}</button>)}</nav>
    {error && <p role="alert" className="error">{error}</p>}
    {tab === 'packages' && <Packages onError={onError} />}
    {tab === 'issues' && <Issues onError={onError} />}
    {tab === 'runs' && <Runs onError={onError} />}
  </section>;
}
