import { spawnSync } from 'node:child_process';
// Read-only inventory: never reads authentication files or invokes inference.
for (const name of ['codex', 'claude', 'gemini']) {
  const found = spawnSync('where.exe', [name], { encoding: 'utf8', shell: false, windowsHide: true });
  const paths = found.status === 0 ? found.stdout.trim().split(/\r?\n/) : [];
  console.log(JSON.stringify({ provider: name, detected_on_path: paths.length > 0, paths,
    entitlement: 'UNVERIFIED', isolation: 'UNVERIFIED', real_execution_enabled: false }));
}
