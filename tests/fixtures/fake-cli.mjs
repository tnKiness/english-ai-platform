// Synthetic stand-in for a CLI, run with node.exe in gateway tests. It performs no inference and calls no network:
// it reads the stdin context and prints a JSON envelope whose inner result reports what the process could see.
import { readdirSync } from 'node:fs';

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input);
  const billingVars = Object.keys(process.env).filter((n) => /API_KEY|BASE_URL|PROXY|BEDROCK|VERTEX/i.test(n));
  const result = {
    schema_version: '1', job_id: request.job_id, context_manifest_id: request.context_manifest_id, processing: 'processed', outcome: 'inconclusive',
    evidence_refs: [], synthetic: true,
    limitations: [`billing_vars=${billingVars.length}`, `cwd_entries=${readdirSync('.').length}`, `ci=${process.env.CI}`, `config_dir_set=${Boolean(process.env.CLAUDE_CONFIG_DIR)}`],
  };
  process.stdout.write(JSON.stringify({ type: 'result', is_error: false, result: JSON.stringify(result) }));
});
