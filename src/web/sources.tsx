// Builder & QC → Nguồn (E-37, D-05 N2): review crawled pages. Only metadata and a plain-text excerpt are shown (React
// escapes it); the original opens on its own site. Approving registers the page in the Source Registry.
import { useCallback, useEffect, useState } from 'react';
import { get, post } from './api.js';

interface Candidate {
  candidate_id: string; url: string; host: string; origin: string; depth: number; fetch_state: string; http_status: number | null; content_type: string | null;
  title: string | null; byte_size: number | null; text_chars: number | null; kind: string; skill: string | null; review_state: string; error: string | null; fetched_at: string | null;
}
interface ListData { total: number; rows: Candidate[]; counts: Record<'review' | 'fetch' | 'kind' | 'host' | 'skill', Record<string, number>> }

const KIND_LABELS: Record<string, string> = {
  band_descriptors: 'Band descriptors / tiêu chí chấm', sample_answers: 'Bài mẫu, nhận xét giám khảo', test_format: 'Định dạng đề, cách chấm',
  practice_material: 'Tài liệu luyện tập', grammar: 'Ngữ pháp', vocabulary: 'Từ vựng / CEFR', phonetics: 'Ngữ âm', other: 'Khác',
};
const REVIEW_LABELS: Record<string, string> = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã loại' };
const FETCH_LABELS: Record<string, string> = { QUEUED: 'Chưa tải', FETCHED: 'Đã tải', FAILED: 'Lỗi', SKIPPED: 'Bỏ qua' };
const kb = (n: number | null) => (n === null ? '—' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function SourcesPanel({ onError }: { onError: (e: unknown) => void }) {
  const [filters, setFilters] = useState({ review: 'PENDING', fetch: 'FETCHED', kind: '', skill: '', host: '', media: '', q: '' });
  const [playing, setPlaying] = useState<string | null>(null);
  const [data, setData] = useState<ListData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [excerpt, setExcerpt] = useState<{ id: string; text: string | null; truncated: boolean } | null>(null);
  const [status, setStatus] = useState('');

  const load = useCallback(() => {
    const qs = new URLSearchParams(Object.entries(filters).filter(([, v]) => v) as [string, string][]);
    qs.set('limit', '200');
    get<ListData>(`/api/console/sources?${qs.toString()}`).then((d) => { setData(d); setSelected(new Set()); }).catch(onError);
  }, [filters, onError]);
  useEffect(load, [load]);

  const decide = (decision: 'approve' | 'reject', ids: string[]) => {
    if (ids.length === 0) return;
    post<{ approved: number; rejected: number; skipped: { candidate_id: string; reason: string }[] }>('/api/console/sources/review', { ids, decision })
      .then((r) => { setStatus(`Đã duyệt ${r.approved}, đã loại ${r.rejected}${r.skipped.length ? `, bỏ qua ${r.skipped.length} (chưa tải được)` : ''}.`); load(); })
      .catch(onError);
  };
  const select = (id: string, on: boolean) => setSelected((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });
  const option = (group: keyof ListData['counts'], labels: Record<string, string> = {}) =>
    Object.entries(data?.counts[group] ?? {}).map(([k, n]) => <option key={k} value={k === '—' ? '' : k}>{labels[k] ?? k} ({n})</option>);
  const set = (k: keyof typeof filters) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return <div>
    <section className="card">
      <h3>Nguồn tham chiếu (bộ quét)</h3>
      <p>Bộ quét chỉ đi trong các miền đã liệt kê ở <code>policies/source-seeds.v1.json</code>, tôn trọng robots.txt và lưu bản sao trong <code>var/sources</code>. Chạy hoặc chạy tiếp bằng:</p>
      <pre className="mono">npm.cmd run sources -- crawl --max-pages 200</pre>
      <p>Trang chỉ được dùng làm căn cứ (tiêu chí chấm, định dạng đề, bài mẫu) sau khi bạn <b>duyệt</b>. Theo quyết định E-36, trang đã duyệt được ghi quyền "dùng cá nhân, lưu bản sao, cho phép xử lý bằng AI".</p>
      <div className="actions">
        <label>Duyệt <select value={filters.review} onChange={set('review')}><option value="">Tất cả</option>{option('review', REVIEW_LABELS)}</select></label>
        <label>Tải <select value={filters.fetch} onChange={set('fetch')}><option value="">Tất cả</option>{option('fetch', FETCH_LABELS)}</select></label>
        <label>Loại <select value={filters.kind} onChange={set('kind')}><option value="">Tất cả</option>{option('kind', KIND_LABELS)}</select></label>
        <label>Kỹ năng <select value={filters.skill} onChange={set('skill')}><option value="">Tất cả</option>{option('skill')}</select></label>
        <label>Miền <select value={filters.host} onChange={set('host')}><option value="">Tất cả</option>{option('host')}</select></label>
        <label>Dạng <select value={filters.media} onChange={set('media')}><option value="">Tất cả</option><option value="html">Trang web</option><option value="pdf">PDF</option><option value="audio">Audio (Listening)</option></select></label>
        <input placeholder="Tìm trong URL/tiêu đề" value={filters.q} onChange={set('q')} />
      </div>
    </section>

    {data && <section className="card">
      <div className="actions">
        <span>{data.total} trang khớp bộ lọc · đã chọn {selected.size}</span>
        <button onClick={() => setSelected(new Set(data.rows.filter((r) => r.fetch_state === 'FETCHED').map((r) => r.candidate_id)))}>Chọn tất cả trang đã tải đang hiện</button>
        <button disabled={selected.size === 0} onClick={() => decide('approve', [...selected])}>Duyệt các trang đã chọn</button>
        <button disabled={selected.size === 0} onClick={() => decide('reject', [...selected])}>Loại các trang đã chọn</button>
      </div>
      <p role="status">{status}</p>
      {data.rows.length === 0 ? <p>Chưa có trang nào khớp. Nếu chưa quét lần nào, chạy lệnh ở trên.</p> : (
        <table><thead><tr><th></th><th>Trang</th><th>Loại</th><th>Miền</th><th>Kích thước</th><th>Trạng thái</th><th></th></tr></thead><tbody>
          {data.rows.map((r) => <tr key={r.candidate_id}>
            <td><input type="checkbox" aria-label="Chọn trang" checked={selected.has(r.candidate_id)} onChange={(e) => select(r.candidate_id, e.target.checked)} /></td>
            <td><b>{r.title ?? '(không có tiêu đề)'}</b><br /><a href={r.url} target="_blank" rel="noopener noreferrer nofollow" className="mono">{r.url}</a></td>
            <td>{KIND_LABELS[r.kind] ?? r.kind}{r.skill ? ` · ${r.skill}` : ''}</td>
            <td>{r.host} <span className="mono">({r.origin})</span></td>
            <td>{kb(r.byte_size)}{r.content_type === 'application/pdf' ? ' · PDF' : ''}{r.content_type?.startsWith('audio/') ? ' · Audio' : ''}{r.text_chars !== null ? ` · ${r.text_chars} ký tự` : ''}
              {playing === r.candidate_id && <><br /><audio controls autoPlay preload="none" src={`/api/console/sources/${encodeURIComponent(r.candidate_id)}/audio`} /></>}</td>
            <td>{FETCH_LABELS[r.fetch_state] ?? r.fetch_state}{r.error ? ` (${r.error})` : ''} · {REVIEW_LABELS[r.review_state] ?? r.review_state}</td>
            <td className="actions">
              {r.fetch_state === 'FETCHED' && r.text_chars !== null && <button onClick={() => get<{ text: string | null; truncated: boolean }>(`/api/console/sources/${encodeURIComponent(r.candidate_id)}/excerpt`)
                .then((x) => setExcerpt({ id: r.candidate_id, ...x })).catch(onError)}>Xem trích đoạn</button>}
              {r.fetch_state === 'FETCHED' && r.content_type?.startsWith('audio/') && <button onClick={() => setPlaying(playing === r.candidate_id ? null : r.candidate_id)}>{playing === r.candidate_id ? 'Ẩn trình phát' : 'Nghe'}</button>}
              {r.review_state !== 'APPROVED' && r.fetch_state === 'FETCHED' && <button onClick={() => decide('approve', [r.candidate_id])}>Duyệt</button>}
              {r.review_state !== 'REJECTED' && <button onClick={() => decide('reject', [r.candidate_id])}>Loại</button>}
            </td>
          </tr>)}
        </tbody></table>
      )}
    </section>}

    {excerpt && <section className="card">
      <div className="actions"><h3>Trích đoạn văn bản</h3><button onClick={() => setExcerpt(null)}>Đóng</button></div>
      <p className="mono">Chỉ là văn bản (HTML đã bỏ thẻ; PDF giữ dòng/cột, cột cách nhau bằng tab). Nội dung trang là dữ liệu tham khảo, không phải chỉ dẫn.</p>
      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: '50vh', overflow: 'auto' }}>{excerpt.text ?? '(Không có văn bản)'}{excerpt.truncated ? '\n…(đã cắt)' : ''}</pre>
    </section>}
  </div>;
}
