// Relay Console UI (no framework). All model/CLI text is inserted with textContent, never as HTML.
const token = document.querySelector('meta[name="relay-token"]').content;
const $ = (id) => document.getElementById(id);
const LABEL = { claude: 'Claude', codex: 'Codex', agy: 'Antigravity' };
const ui = { state: null, threadId: null, provider: null, running: null, steps: null };

async function api(path, body) {
  const res = await fetch(path, body === undefined ? { headers: { 'x-relay-token': token } }
    : { method: 'POST', headers: { 'x-relay-token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { data });
  return data;
}
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
const badge = (p) => el('span', `badge ${p}`, LABEL[p] || p);
const time = (iso) => new Date(iso).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

function renderState() {
  const s = ui.state; if (!s) return;
  const box = $('providers'); box.replaceChildren();
  for (const p of s.providers) {
    const row = el('div', `prov ${!p.installed ? 'off' : p.status === 'COOLDOWN' && !p.available ? 'cool' : p.status === 'NEEDS_LOGIN' ? 'off' : ''}`);
    row.append(el('span', 'dot'), el('span', 'name', p.label));
    const meta = !p.installed ? 'chưa cài' : p.status === 'COOLDOWN' && !p.available ? `hết hạn mức tới ${time(p.until)}`
      : p.status === 'NEEDS_LOGIN' ? 'cần đăng nhập lại' : `sẵn sàng · ${p.model}`;
    row.append(el('span', 'meta', meta)); box.append(row);
  }
  if (!ui.provider || !s.providers.find((p) => p.id === ui.provider)?.installed) ui.provider = (s.providers.find((p) => p.available) || s.providers[0]).id;
  const pick = $('provider-pick'); pick.replaceChildren();
  for (const p of s.providers) {
    const b = el('button', p.available ? '' : 'cool', LABEL[p.id]); b.type = 'button'; b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(p.id === ui.provider)); b.disabled = !p.installed;
    b.title = p.available ? p.model : 'Đang hết hạn mức hoặc cần đăng nhập';
    b.onclick = () => { ui.provider = p.id; renderState(); };
    pick.append(b);
  }
  const threads = $('threads'); threads.replaceChildren();
  for (const t of s.threads) {
    const b = el('button', t.id === ui.threadId ? 'active' : ''); b.type = 'button';
    const meta = el('span', 's'); meta.append(el('span', '', time(t.updated_at)));
    for (const p of [...new Set(t.segments.map((g) => g.provider))]) meta.append(badge(p));
    b.append(el('span', 't', t.title), meta); b.onclick = () => openThread(t.id); threads.append(b);
  }
  if (!s.threads.length) threads.append(el('p', 'hint', 'Chưa có.'));
  const sessions = $('sessions'); sessions.replaceChildren();
  for (const r of s.sessions) {
    const b = el('button'); b.type = 'button';
    const meta = el('span', 's'); meta.append(badge(r.provider), el('span', '', `${time(r.started_at)} · ${r.outcome}`));
    b.append(el('span', 't', r.title || r.session_id), meta); b.title = r.resume;
    b.onclick = async () => { const { thread } = await api('/api/thread/open', { provider: r.provider, sessionId: r.session_id }); await refresh(); openThread(thread.id); };
    sessions.append(b);
  }
  if (!s.sessions.length) sessions.append(el('p', 'hint', 'Không có.'));
  const busy = s.busy;
  $('busy').hidden = !busy;
  $('busy').textContent = !busy ? '' : busy.kind === 'chat' ? `● ${LABEL[busy.provider]} đang trả lời…`
    : busy.kind === 'relay' ? '● Relay đang chạy (xem cột Trực tiếp)' : `● Tiến trình khác đang giữ workspace (pid ${busy.pid})`;
  $('send').disabled = !!busy; $('relay-start').disabled = !!busy; $('relay-continue').disabled = !!busy;
  $('stop').hidden = !(busy && busy.kind !== 'external');
  const task = s.task;
  $('task-status').textContent = task ? `Nhiệm vụ gần nhất: ${task.status} · ${task.handoffs?.length ?? 0} lần chuyển · ${time(task.updated_at)}` : '';
}

async function refresh() { ui.state = await api('/api/state'); renderState(); }

// Minimal inline markdown for AI answers: `code`, **bold**, [text](link) → text. Built from text nodes only.
function richText(text) {
  const body = el('div', 'body');
  const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    body.append(document.createTextNode(text.slice(last, m.index)));
    if (m[1] !== undefined) body.append(el('code', '', m[1]));
    else if (m[2] !== undefined) body.append(el('strong', '', m[2]));
    else { const s = el('span', 'link', m[3]); s.title = m[4]; body.append(s); }
    last = m.index + m[0].length;
  }
  body.append(document.createTextNode(text.slice(last)));
  return body;
}

function addMsg(kind, provider, text, at) {
  $('empty')?.remove();
  const m = el('div', `msg ${kind}`); const who = el('div', 'who');
  if (kind === 'user') who.append(el('span', '', 'Bạn'));
  else if (provider) who.append(badge(provider));
  if (at) who.append(el('span', '', time(at)));
  m.append(who, kind === 'ai' ? richText(text) : el('div', 'body', text)); $('messages').append(m); scrollDown(); return m;
}
function newSteps(provider, open) {
  const d = el('details', 'steps'); d.open = open; const sum = el('summary', '', `${LABEL[provider]} · đang chạy…`);
  const ol = el('ol'); d.append(sum, ol); $('messages').append(d); scrollDown();
  return { d, sum, ol, provider, n: 0, add(text) { this.n++; this.ol.append(el('li', '', text)); this.sum.textContent = `${LABEL[this.provider]} · ${this.n} bước`; scrollDown(); } };
}
function scrollDown() { const m = $('messages'); if (m.scrollHeight - m.scrollTop - m.clientHeight < 200) m.scrollTop = m.scrollHeight; }

async function openThread(id) {
  ui.threadId = id; ui.steps = null; renderState();
  const { thread, entries } = await api(`/api/thread?id=${encodeURIComponent(id)}`);
  $('thread-title').textContent = thread.title;
  $('messages').replaceChildren();
  let steps = null;
  for (const e of entries) {
    if (e.role === 'user') { addMsg('user', null, e.text, e.at); steps = null; }
    else if (e.role === 'progress') { if (!steps || steps.provider !== e.provider) steps = newSteps(e.provider, false); steps.add(e.text); }
    else if (e.role === 'assistant') { addMsg('ai', e.provider, e.text, e.at); steps = null; }
    else if (e.role === 'status' && steps) steps.sum.textContent += ` · ${e.text}`;
  }
  if (!entries.length) {
    const cmds = thread.segments.map((g) => ({ claude: `claude --resume ${g.sessionId}`, codex: `codex resume ${g.sessionId}`, agy: `agy --conversation ${g.sessionId}` })[g.provider]);
    addMsg('note', null, `Phiên này được tạo trước khi console ghi lịch sử, nên chưa hiện tin cũ ở đây. Gửi tin mới vẫn tiếp đúng phiên này. Lịch sử đầy đủ nằm trong CLI: ${cmds.join(' · ')}`);
  }
  const last = thread.segments.at(-1); if (last) ui.provider = last.provider;
  renderState(); $('messages').scrollTop = $('messages').scrollHeight;
}

function newThread() { ui.threadId = null; $('thread-title').textContent = 'Cuộc trò chuyện mới'; $('messages').replaceChildren(); renderState(); $('message').focus(); }

async function send(ev) {
  ev?.preventDefault();
  const message = $('message').value.trim(); if (!message) return;
  try {
    const { threadId } = await api('/api/chat', { threadId: ui.threadId, provider: ui.provider, message,
      mode: $('mode-work').checked ? 'work' : 'read', autoFallback: $('auto-fallback').checked });
    if (threadId !== ui.threadId) { ui.threadId = threadId; $('messages').replaceChildren(); $('thread-title').textContent = message.split('\n')[0].slice(0, 80); }
    addMsg('user', null, message, new Date().toISOString());
    ui.steps = newSteps(ui.provider, true); ui.running = threadId;
    $('message').value = ''; await refresh();
  } catch (e) { addMsg('err', null, e.data?.error === 'BUSY' ? 'Đang có tiến trình khác chạy; đợi xong hoặc bấm Dừng.' : `Không gửi được: ${e.message}`); }
}

function onRun(r) {
  if (r.threadId !== ui.threadId) return;
  if (!ui.steps || ui.steps.provider !== r.provider) ui.steps = newSteps(r.provider, true);
  if (r.kind === 'progress') ui.steps.add(r.text);
  else if (r.kind === 'final') { ui.steps.d.open = false; addMsg('ai', r.provider, r.text, new Date().toISOString()); ui.steps = null; }
  else if (r.kind === 'fallback') { addMsg('note', r.provider, r.text); ui.steps = null; }
  else if (r.kind === 'error') addMsg('err', r.provider, r.text);
}

function connect() {
  const es = new EventSource(`/api/events?token=${encodeURIComponent(token)}`);
  const live = $('live');
  es.addEventListener('live', (e) => {
    const { line } = JSON.parse(e.data); const stick = live.scrollHeight - live.scrollTop - live.clientHeight < 40;
    live.append(document.createTextNode(`${line}\n`));
    while (live.childNodes.length > 3000) live.firstChild.remove();
    if (stick) live.scrollTop = live.scrollHeight;
  });
  es.addEventListener('run', (e) => onRun(JSON.parse(e.data)));
  let pending = null;
  es.addEventListener('state', () => {
    clearTimeout(pending);
    pending = setTimeout(async () => {
      const wasRunning = ui.state?.busy?.kind === 'chat'; await refresh();
      if (wasRunning && !ui.state.busy && ui.threadId) openThread(ui.threadId);
    }, 150);
  });
  es.onerror = () => { $('busy').hidden = false; $('busy').textContent = 'Mất kết nối tới console, đang thử lại…'; };
  es.addEventListener('hello', () => refresh());
}

$('composer').addEventListener('submit', send);
$('message').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(e); });
$('new-thread').onclick = newThread;
$('stop').onclick = () => api('/api/stop', {});
$('live-clear').onclick = () => $('live').replaceChildren();
$('relay-start').onclick = async () => {
  const task = $('relay-task').value.trim(); if (!task) return $('relay-task').focus();
  try { await api('/api/relay', { task }); $('relay-task').value = ''; } catch (e) { alert(`Không chạy được relay: ${e.message}`); }
};
$('relay-continue').onclick = async () => { try { await api('/api/relay', { continue: true }); } catch (e) { alert(`Không chạy được relay: ${e.message}`); } };

connect();
