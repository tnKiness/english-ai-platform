// Synthetic stand-in for `codex` used by the D-01 verification tests (run with node.exe). No inference, no network.
// Behaviour comes from CODEX_HOME/fake-mode.txt: "contained" (default) never reads outside its cwd, "leaky" reads
// any path named in the prompt plus ../AGENTS.md, "apikey" reports an API-key login.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers';

const args = process.argv.slice(2);
const home = process.env.CODEX_HOME ?? '';
const mode = existsSync(join(home, 'fake-mode.txt')) ? readFileSync(join(home, 'fake-mode.txt'), 'utf8').trim() : 'contained';

if (args[0] === '--version') {
  process.stdout.write('codex-cli 0.0.0-synthetic\n');
} else if (args[0] === 'login' && args[1] === 'status') {
  // Real CLIs may print status on stderr; the verifier must read both streams.
  process.stderr.write(mode === 'apikey' ? 'Logged in using an API key - synthetic\n' : 'Logged in using ChatGPT\n');
} else if (args[0] === 'exec') {
  let prompt = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { prompt += c; });
  process.stdin.on('end', () => {
    if (prompt.includes('Synthetic long-task test')) {
      // A grandchild process that must die with the tree.
      const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore', windowsHide: true });
      writeFileSync(join(home, 'synthetic-child.json'), JSON.stringify({ pid: child.pid, ppid: process.pid }));
      setTimeout(() => {}, 120000);
      return;
    }
    let reply = 'CANNOT_READ';
    if (mode === 'empty') return;
    if (mode === 'failed') { process.exitCode = 2; return; }
    const json = prompt.split(/\r?\n/).find((l) => l.startsWith('{"schema_version"'));
    if (json) reply = json;
    else if (mode === 'leaky') {
      const paths = [...prompt.matchAll(/((?:[A-Za-z]:\\|\.\.\/|linked\/)[^\s]+\.txt)/g)].map((m) => m[1]);
      const parts = paths.filter((p) => existsSync(resolve(p))).map((p) => readFileSync(resolve(p), 'utf8').trim());
      if (existsSync(resolve('..', 'AGENTS.md'))) parts.push(readFileSync(resolve('..', 'AGENTS.md'), 'utf8').trim());
      if (parts.length) reply = parts.join(' ');
    } else if (prompt.includes('single word OK')) reply = 'OK';
    const events = [{ type: 'thread.started', thread_id: 'synthetic' }, { type: 'item.completed', item: { id: 'i0', type: 'reasoning', text: 'synthetic' } },
      { type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: reply } }, { type: 'turn.completed', usage: { input_tokens: 0, output_tokens: 0 } }];
    if (mode === 'policy-blocked' && !json) {
      events.splice(1, 0, { type: 'item.completed', item: { id: 'command', type: 'command_execution',
        aggregated_output: 'CreateProcess rejected: blocked by policy', exit_code: 1 } });
    }
    process.stdout.write(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  });
} else {
  process.stderr.write(`fake-codex: unsupported ${args.join(' ')}\n`);
  process.exitCode = 2;
}
