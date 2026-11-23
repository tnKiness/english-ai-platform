import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BuilderConsole } from './console.js';
import { ReadingScreen } from './reading.js';
import { ListeningScreen } from './listening.js';
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
    <header className="app-header">
      <div>
        <p className="eyebrow">KHÔNG GIAN HỌC IELTS</p>
        <p className={connected === false ? 'status offline' : 'status'} aria-live="polite">{connected === null ? 'Đang kết nối…' : connected ? 'Đã kết nối ứng dụng cục bộ' : 'Chưa kết nối được ứng dụng cục bộ: chạy npm.cmd run app'}</p>
      </div>
      <button className={view === 'settings' ? 'active' : ''} onClick={() => { setActiveAttemptId(null); setView('settings'); }}>Cài đặt &amp; Mục tiêu</button>
    </header>
    <nav className="tabs">{([['today', 'Học hôm nay'], ['progress', 'Tiến độ'], ['builder', 'Builder & QC']] as const).map(([k, label]) =>
      <button key={k} className={view === k && !activeAttemptId ? 'active' : ''} onClick={() => { setActiveAttemptId(null); setView(k); }}>{label}</button>)}</nav>
    {activeAttemptId ? (
      <WorkspaceScreen attemptId={activeAttemptId} onSwitchAttempt={setActiveAttemptId} onBack={() => setActiveAttemptId(null)} />
    ) : view === 'today' ? (
      <TodayScreen onOpenAttempt={setActiveAttemptId} extras={{ reading: <ReadingScreen />, listening: <ListeningScreen />, audio: <AudioScreen /> }} />
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
