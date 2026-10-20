// Fake CLI for Relay Console tests. argv: <provider claude|codex|agy> <behaviour ok|quota> <resume id or "">.
// Emits the event format observed from the real CLI on 20/10/2026; answers with what it was asked.
import { randomUUID } from 'node:crypto';

const [provider, behaviour, resume] = process.argv.slice(2);
const sid = resume || randomUUID();
let prompt = '';
process.stdin.on('data', (c) => { prompt += c; });
process.stdin.on('end', () => {
  const out = (o) => process.stdout.write(`${JSON.stringify(o)}\n`);
  const last = prompt.trim().split('\n').at(-1);
  const answer = `echo:${last}|missed=${prompt.includes('Trong lúc bạn vắng')}|resumed=${Boolean(resume)}\nRELAY_STATUS: DONE`;
  if (provider === 'claude') {
    out({ type: 'system', subtype: 'init', session_id: sid, model: 'fake' });
    out({ type: 'assistant', session_id: sid, message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'package.json' } }] } });
    if (behaviour === 'quota') {
      out({ type: 'rate_limit_event', rate_limit_info: { status: 'rejected', resetsAt: Math.floor(Date.now() / 1000) + 3600, rateLimitType: 'five_hour' } });
      out({ type: 'result', subtype: 'error', is_error: true, result: 'Usage limit reached', session_id: sid });
      process.exitCode = 1; return;
    }
    out({ type: 'result', subtype: 'success', is_error: false, result: answer, session_id: sid, num_turns: 1, duration_ms: 10 });
  } else if (provider === 'codex') {
    out({ type: 'thread.started', thread_id: sid });
    out({ type: 'item.started', item: { type: 'command_execution', command: 'git status' } });
    out({ type: 'item.completed', item: { type: 'agent_message', text: answer } });
  } else {
    out({ event: 'init', conversation_id: sid, init: { model: 'fake' } });
    out({ event: 'step_update', step_update: { state: 'ACTIVE', step_type: 'tool', tool_name: 'read_file', tool_info: { parameters: { Path: 'package.json' } } } });
    out({ event: 'result', result: { status: 'SUCCESS', response: answer, duration_seconds: 0.01 } });
  }
});
