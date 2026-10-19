import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/health', { signal: controller.signal }).then(async (r) => {
      const data: unknown = await r.json();
      setConnected(r.ok && typeof data === 'object' && data !== null && 'status' in data && data.status === 'ok');
    }).catch(() => { if (!controller.signal.aborted) setConnected(false); });
    return () => controller.abort();
  }, []);
  return <main><p className="eyebrow">KHÔNG GIAN HỌC IELTS</p><h1>Chuẩn bị cho hành trình học của bạn.</h1>
    <p>Ứng dụng đang được xây dựng. Bài học và đánh giá năng lực chưa được mở.</p>
    <section aria-live="polite"><h2>Trạng thái kết nối</h2><p>{connected === null ? 'Đang kiểm tra…' : connected ? 'Đã kết nối ứng dụng cục bộ.' : 'Chưa kết nối được ứng dụng cục bộ.'}</p>
    <p>AI chưa được kích hoạt. Chưa có dữ liệu học tập được thu thập.</p></section></main>;
}
createRoot(document.getElementById('root')!).render(<App />);
