import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BuilderConsole } from './console.js';
import './style.css';

function App() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [view, setView] = useState<'today' | 'progress' | 'builder'>('builder');
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/health', { signal: controller.signal }).then(async (r) => {
      const data: unknown = await r.json();
      setConnected(r.ok && typeof data === 'object' && data !== null && 'status' in data && data.status === 'ok');
    }).catch(() => { if (!controller.signal.aborted) setConnected(false); });
    return () => controller.abort();
  }, []);
  return <main>
    <p className="eyebrow">KHÔNG GIAN HỌC IELTS</p>
    <nav className="tabs">{([['today', 'Học hôm nay'], ['progress', 'Tiến độ'], ['builder', 'Builder & QC']] as const).map(([k, label]) =>
      <button key={k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>{label}</button>)}</nav>
    <p className="status" aria-live="polite">{connected === null ? 'Đang kiểm tra kết nối…' : connected ? 'Đã kết nối ứng dụng cục bộ. AI thật chưa được kích hoạt.' : 'Chưa kết nối được ứng dụng cục bộ.'}</p>
    {view === 'builder' ? <BuilderConsole /> : <section><h2>{view === 'today' ? 'Học hôm nay' : 'Tiến độ'}</h2><p>Chưa mở: luồng học và hồ sơ năng lực thuộc giai đoạn sau. Chưa có dữ liệu học tập được thu thập.</p></section>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
