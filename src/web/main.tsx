import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BuilderConsole } from './console.js';
import { ReadingScreen } from './reading.js';
import { AudioScreen } from './audio.js';
import { ProgressScreen, SettingsScreen, TodayScreen, WorkspaceScreen } from './learning.js';
import './style.css';

function App() {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [view, setView] = useState<'today' | 'progress' | 'builder' | 'settings'>('today');
  const [activeAttemptId, setActiveAttemptId] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/health', { signal: controller.signal }).then(async (r) => {
      const data: unknown = await r.json();
      setConnected(r.ok && typeof data === 'object' && data !== null && 'status' in data && data.status === 'ok');
    }).catch(() => { if (!controller.signal.aborted) setConnected(false); });
    return () => controller.abort();
  }, []);
  return <main>
    <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
      <p className="eyebrow">KHÔNG GIAN HỌC IELTS</p>
      <button className={view === 'settings' ? 'active' : ''} onClick={() => { setActiveAttemptId(null); setView('settings'); }}>Cài đặt &amp; Mục tiêu</button>
    </div>
    <nav className="tabs">{([['today', 'Học hôm nay'], ['progress', 'Tiến độ'], ['builder', 'Builder & QC']] as const).map(([k, label]) =>
      <button key={k} className={view === k && !activeAttemptId ? 'active' : ''} onClick={() => { setActiveAttemptId(null); setView(k); }}>{label}</button>)}</nav>
    <p className="status" aria-live="polite">{connected === null ? 'Đang kiểm tra kết nối…' : connected ? 'Đã kết nối ứng dụng cục bộ. AI thật chưa được kích hoạt (chỉ chạy FakeAdapter synthetic).' : 'Chưa kết nối được ứng dụng cục bộ.'}</p>
    {activeAttemptId ? (
      <WorkspaceScreen attemptId={activeAttemptId} onSwitchAttempt={setActiveAttemptId} onBack={() => setActiveAttemptId(null)} />
    ) : view === 'today' ? (
      <><TodayScreen onOpenAttempt={setActiveAttemptId} /><ReadingScreen /><AudioScreen /></>
    ) : view === 'progress' ? (
      <ProgressScreen />
    ) : view === 'settings' ? (
      <SettingsScreen />
    ) : (
      <BuilderConsole />
    )}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App />);
