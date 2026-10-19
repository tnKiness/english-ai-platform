import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const mode = process.argv[2];
if (mode === 'echo') {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', data => { input += data; });
  process.stdin.on('end', () => process.stdout.write(input));
} else if (mode === 'tree') {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });
  writeFileSync(process.argv[3], String(child.pid));
  setInterval(() => {}, 1000);
} else if (mode === 'flood') {
  setInterval(() => process.stdout.write('x'.repeat(8192)), 5);
} else { setInterval(() => {}, 1000); }
