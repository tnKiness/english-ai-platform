// Synthetic stand-in for `claude` and `agy` used by E-21/E-22/E-23 D-01 verification & boundary tests (run with node.exe).
// No inference, no network. Behaviour is controlled by `fake-mode.txt` in the profile dir:
// - CLAUDE_CONFIG_DIR (claude): "contained" (tools:[], mcp_servers:[]), "tools-nonempty", "mcp-nonempty",
//   "plugin-extra", "apikey", "quota", "failed".
// - USERPROFILE (agy): "contained" (respects settings.json deny rules and emits "permission check failed"),
//   "leaky" (reads bait files and prints content despite settings.json), "tool-executed" (emits a DONE tool step),
//   "unlogged", "quota", "failed".
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers';

const args = process.argv.slice(2);
const claudeProfile = process.env.CLAUDE_CONFIG_DIR ?? '';
const agyProfile = process.env.USERPROFILE ?? '';
const isClaude = Boolean(claudeProfile);
const profileDir = isClaude ? claudeProfile : agyProfile;
const modeFile = join(profileDir, 'fake-mode.txt');
const mode = existsSync(modeFile) ? readFileSync(modeFile, 'utf8').trim() : 'contained';

if (args[0] === '--version') {
  const customVer = existsSync(join(profileDir, 'fake-version.txt')) ? readFileSync(join(profileDir, 'fake-version.txt'), 'utf8').trim() : '';
  process.stdout.write((customVer || (isClaude ? '2.1.288 (Claude Code synthetic)' : 'agy 1.4.2-synthetic')) + '\n');
} else if (isClaude && args[0] === 'auth' && args[1] === 'status') {
  if (mode === 'apikey') {
    process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'api_key', subscriptionType: null }) + '\n');
  } else if (mode === 'unlogged') {
    process.stdout.write(JSON.stringify({ loggedIn: false, authMethod: 'none', subscriptionType: null }) + '\n');
  } else {
    process.stdout.write(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', subscriptionType: 'pro' }) + '\n');
  }
} else if (!isClaude && args[0] === 'models') {
  if (mode === 'unlogged') {
    process.stderr.write('Error: Not logged in\n');
    process.exitCode = 1;
  } else {
    process.stdout.write('gemini-4-argon-medium\ngemini-4-argon-low\n');
  }
} else if (args.includes('-p') || args.includes('-p=')) {
  let stdin = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { stdin += c; });
  process.stdin.on('end', () => {
    let promptText = stdin;
    if (!isClaude && args.includes('--input-format')) {
      try {
        const line = stdin.trim().split(/\r?\n/)[0] ?? '';
        const parsed = JSON.parse(line);
        // Real agy 1.4.3 format: {"event":"user","message":{"content": string | [{type:"text",text}]}}; reject anything else like agy does.
        if (parsed.event !== 'user' || !parsed.message || parsed.message.content === undefined) throw new Error('bad agy stream input');
        const c = parsed.message.content;
        promptText = typeof c === 'string' ? c : c.map((p) => p.text ?? '').join('');
      } catch {
        process.stderr.write('Invalid stream-json input\n');
        process.exitCode = 1;
        return;
      }
    }

    const selectedModel = args[(args.includes('--model') ? args.indexOf('--model') : args.indexOf('-m')) + 1];
    appendFileSync(join(profileDir, 'calls.jsonl'), JSON.stringify({ model: selectedModel, long: promptText.includes('Synthetic long-task test') }) + '\n');
    if (selectedModel === 'quota-model') {
      process.stdout.write(JSON.stringify(isClaude ? { type: 'result', is_error: true, result: 'usage limit' } : { event: 'error', error: { message: 'quota exhausted' } }) + '\n');
      process.exitCode = 1;
      return;
    }
    if (selectedModel === 'invalid-model') { process.stdout.write('{}\n'); return; }
    if (promptText.includes('Synthetic long-task test')) {
      const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)'], { stdio: 'ignore', windowsHide: true });
      writeFileSync(join(profileDir, 'synthetic-child.json'), JSON.stringify({ pid: child.pid, ppid: process.pid }));
      setTimeout(() => {}, 120000);
      return;
    }

    if (mode === 'failed') {
      process.stderr.write('Synthetic process failure\n');
      process.exitCode = 2;
      return;
    }

    if (isClaude) {
      if (mode === 'quota') {
        const events = [
          { type: 'system', subtype: 'init', session_id: 'syn-claude', tools: [], mcp_servers: [], plugins: ['cc-plugin-agents-md'] },
          { type: 'rate_limit_event', rate_limit_info: { status: 'rejected', rateLimitType: 'five_hour', overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled' } },
          { type: 'result', subtype: 'error', is_error: true, result: 'You have hit your usage limit.' },
        ];
        process.stdout.write(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
        process.exitCode = 1;
        return;
      }
      const tools = mode === 'tools-nonempty' ? ['Bash', 'Read'] : [];
      const mcp = mode === 'mcp-nonempty' ? ['paid-mcp-server'] : [];
      const plugins = mode === 'plugin-extra'
        ? ['cc-plugin-agents-md', 'cc-plugin-telemetry', 'cc-plugin-plugin-authoring', 'custom-paid-plugin']
        : ['cc-plugin-agents-md', 'cc-plugin-telemetry', 'cc-plugin-plugin-authoring'];

      let reply = 'OK';
      const jsonLine = promptText.split(/\r?\n/).find((l) => l.startsWith('{"schema_version"'));
      if (jsonLine) reply = jsonLine;
      else if (promptText.includes('DATA (')) {
        const req = JSON.parse(promptText.trimEnd().split('\n').at(-1));
        reply = JSON.stringify({
          schema_version: '1', job_id: req.job_id, context_manifest_id: req.context_manifest_id,
          processing: 'processed', outcome: 'inconclusive', evidence_refs: [], limitations: ['claude-stream-ok'], synthetic: true,
        });
      }

      const events = [
        { type: 'system', subtype: 'init', session_id: 'syn-claude', model: 'claude-opus-5-5', tools, mcp_servers: mcp, plugins },
        { type: 'rate_limit_event', rate_limit_info: { status: 'allowed', overageStatus: 'rejected', overageDisabledReason: 'org_level_disabled' } },
        { type: 'assistant', message: { content: [{ type: 'text', text: reply }] } },
        { type: 'result', subtype: 'success', is_error: false, duration_ms: 100, num_turns: 1, result: reply },
      ];
      process.stdout.write(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
    } else {
      // agy stream-json
      if (mode === 'quota') {
        const events = [
          { event: 'init', conversation_id: 'syn-agy', init: { model: 'gemini-4-argon-medium', tools: ['read_file', 'command'] } },
          { event: 'error', error: { message: 'RESOURCE_EXHAUSTED: usage limit reached (429)' } },
        ];
        process.stdout.write(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
        process.exitCode = 1;
        return;
      }

      const m = /read "([^"]+)"/.exec(promptText);
      if (m) {
        const target = resolve(m[1]);
        if (mode === 'leaky' && existsSync(target)) {
          const content = readFileSync(target, 'utf8').trim();
          const events = [
            { event: 'init', conversation_id: 'syn-agy', init: { model: 'gemini-4-argon-medium', tools: Array.from({ length: 60 }, (_, i) => `tool_${i}`) } },
            { event: 'step_update', step_update: { step_type: 'tool', tool_name: 'read_file', state: 'DONE', output: content } },
            { event: 'result', result: { status: 'SUCCESS', duration_seconds: 0.2, response: content } },
          ];
          process.stdout.write(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
          return;
        }
        const events = [
          { event: 'init', conversation_id: 'syn-agy', init: { model: 'gemini-4-argon-medium', tools: Array.from({ length: 60 }, (_, i) => `tool_${i}`) } },
          { event: 'step_update', step_update: { step_type: 'tool', tool_name: 'read_file', state: 'ERROR', error: 'permission check failed: read_file(*) is denied by settings.json' } },
          { event: 'result', result: { status: 'SUCCESS', duration_seconds: 0.2, response: 'BLOCKED: permission check failed' } },
        ];
        process.stdout.write(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
        return;
      }

      let reply = 'OK';
      const jsonLine = promptText.split(/\r?\n/).find((l) => l.startsWith('{"schema_version"'));
      if (jsonLine) reply = jsonLine;
      else if (promptText.includes('DATA (')) {
        const req = JSON.parse(promptText.trimEnd().split('\n').at(-1));
        reply = JSON.stringify({
          schema_version: '1', job_id: req.job_id, context_manifest_id: req.context_manifest_id,
          processing: 'processed', outcome: 'inconclusive', evidence_refs: [], limitations: ['agy-stream-ok', `home_matches=${process.env.HOME === process.env.USERPROFILE}`], synthetic: true,
        });
      }
      const events = [
        { event: 'init', conversation_id: 'syn-agy', init: { model: 'gemini-4-argon-medium', tools: Array.from({ length: 60 }, (_, i) => `tool_${i}`) } },
        ...(mode === 'tool-executed' ? [{ event: 'step_update', step_update: { step_type: 'tool', tool_name: 'read_file', state: 'DONE', output: 'executed' } }] : []),
        { event: 'result', result: { status: 'SUCCESS', duration_seconds: 0.2, response: reply } },
      ];
      process.stdout.write(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
    }
  });
} else {
  process.stderr.write(`fake-e21-cli: unsupported ${args.join(' ')}\n`);
  process.exitCode = 2;
}
