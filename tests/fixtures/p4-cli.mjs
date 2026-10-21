// Synthetic CLI: fixed argv decides the failure; stdin remains untrusted data.
let input = '';
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  const request = JSON.parse(input.trimEnd().split('\n').at(-1));
  const error = process.argv[2];
  if (error !== 'success') { process.stdout.write(JSON.stringify({ is_error: true, result: error })); return; }
  process.stdout.write(JSON.stringify({ result: JSON.stringify({ schema_version: '1', job_id: request.job_id,
    context_manifest_id: request.context_manifest_id, processing: 'processed', outcome: 'inconclusive',
    evidence_refs: [], limitations: ['Synthetic failover fixture'], synthetic: true }) }));
});
