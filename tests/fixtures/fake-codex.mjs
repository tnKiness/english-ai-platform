// Synthetic stand-in for `codex` used by the D-01 verification tests (run with node.exe). No inference, no network.
// Behaviour comes from CODEX_HOME/fake-mode.txt: "contained" (default) never reads outside its cwd, "leaky" reads
// any path named in the prompt plus ../AGENTS.md, "apikey" reports an API-key login. `sandbox` and `features list`
// modes: see below.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { setTimeout } from 'node:timers';

const args = process.argv.slice(2);
const home = process.env.CODEX_HOME ?? '';
const mode = existsSync(join(home, 'fake-mode.txt')) ? readFileSync(join(home, 'fake-mode.txt'), 'utf8').trim() : 'contained';

if (args.at(-2) === 'features' && args.at(-1) === 'list') {
  // `codex [--disable <f>]... features list`: each named feature is reported disabled, except in "*-pinned" modes
  // where unified_exec stays on (as observed on codex-cli 0.163.0-alpha.10.2). Malformed names exit 1 like the CLI.
  const names = args.slice(0, -2).filter((_, i) => i % 2 === 1);
  if (names.some((n) => !/^[a-z0-9_.]+$/.test(n))) { process.stderr.write('Error: Unknown feature flag\n'); process.exitCode = 1; }
  else process.stdout.write([...names, 'shell_tool'].filter((n, i, a) => a.indexOf(n) === i)
    .map((n) => `${n.padEnd(40)} stable             ${names.includes(n) && !(n === 'unified_exec' && mode.endsWith('-pinned')) ? 'false' : 'true'}`).join('\n') + '\n');
} else if (args[0] === '--version') {
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
} else if (args[0] === 'sandbox') {
  // `codex sandbox [-c k=v]... -- <cmd>`: never runs <cmd>. whoami answers as the sandbox account; the PowerShell
  // read script is interpreted here: "contained" allows only paths whose real path is inside the cwd, "*leaky"
  // allows everything, "user-token*" runs without CodexSandboxUsers, "sandbox-broken" cannot start. Status tokens only.
  const cmd = args.slice(args.indexOf('--') + 1);
  writeFileSync(join(home, 'fake-sandbox-args.json'), JSON.stringify(args.slice(0, args.indexOf('--'))));
  if (mode === 'sandbox-broken') {
    process.stderr.write('windows sandbox failed: synthetic\n');
    process.exitCode = 1;
  } else if (/whoami\.exe$/i.test(cmd[0] ?? '')) {
    const userToken = mode.startsWith('user-token');
    process.stdout.write(cmd.includes('/groups') ? `"Everyone","Well-known group","S-1-1-0","Enabled"\n${userToken ? '' : '"SYNTHETIC\\CodexSandboxUsers","Alias","S-1-5-21-1","Enabled"\n'}`
      : `${userToken ? 'synthetic\\pc' : 'synthetic\\codexsandboxoffline'}\n`);
  } else {
    const script = cmd[cmd.length - 1] ?? '';
    const unq = (name) => (new RegExp(`\\$${name}='((?:[^']|'')*)'`).exec(script)?.[1] ?? '').replace(/''/g, "'");
    const target = resolve(unq('p'));
    const marker = unq('m');
    const inside = (p) => { const r = relative(realpathSync(process.cwd()), p); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
    if (!existsSync(target)) process.stdout.write('SE_PROBE BLOCKED ObjectNotFound PathNotFound,Microsoft.PowerShell.Commands.GetContentCommand\n');
    // "open-repo-local*": like the real machine after the E-15 ACLs — repo files and the %LOCALAPPDATA% bait readable.
    else if (!mode.endsWith('leaky') && !(mode.startsWith('open-repo-local') && /^(?!SE-BOUNDARY-)|^SE-BOUNDARY-local_app_data-/.test(readFileSync(target, 'utf8')))
      && !inside(realpathSync(target))) process.stdout.write('SE_PROBE BLOCKED PermissionDenied GetContentReaderUnauthorizedAccessError,Microsoft.PowerShell.Commands.GetContentCommand\n');
    else {
      const text = readFileSync(target, 'utf8');
      process.stdout.write(marker === '' ? 'SE_PROBE READ\n' : text.includes(marker) ? 'SE_PROBE READ_MATCH\n' : 'SE_PROBE READ_MISMATCH\n');
    }
  }
} else {
  process.stderr.write(`fake-codex: unsupported ${args.join(' ')}\n`);
  process.exitCode = 2;
}
