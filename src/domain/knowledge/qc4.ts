// QC4 decision (05 §5.C): the AI solves blind and audits separately; the application compares and decides.
export interface Qc4Case { case_id: string; run: 'blind_solve' | 'assessment'; target_item: string | null; expected_outcome: 'met' | 'not_met' | 'inconclusive' | null }
export interface Qc4Job { case_id: string; step: 'blind_solve' | 'verification' | 'assessment'; state: string; providers: string[]; result: unknown }
export interface Qc4Key { item: string; answers: { question_id: string; accepted: string[] }[] }
export interface Qc4Finding { code: 'QC4_NOT_RUN' | 'QC4_BLIND_SOLVE_MISMATCH' | 'QC4_COMPETING_ANSWER' | 'QC4_TEST_CASE_FAILED' | 'QC4_SYNTHETIC_ONLY'; case_id: string; detail: string }

const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();

export function evaluateQc4(cases: Qc4Case[], jobs: Qc4Job[], keys: Qc4Key[], origin: 'synthetic_fixture' | 'sourced'):
  { status: 'PASS' | 'FAIL' | 'NOT_RUN'; method: 'synthetic_fake' | 'ai_semantic'; findings: Qc4Finding[] } {
  const findings: Qc4Finding[] = [];
  const job = (c: string, step: Qc4Job['step']) => jobs.find((j) => j.case_id === c && j.step === step);
  const done = (j: Qc4Job | undefined, c: string, step: string) => {
    if (j?.state === 'COMPLETED' && j.result !== undefined) return true;
    findings.push({ code: 'QC4_NOT_RUN', case_id: c, detail: `${step}: ${j?.state ?? 'not enqueued'}` });
    return false;
  };
  if (cases.length === 0) findings.push({ code: 'QC4_NOT_RUN', case_id: '-', detail: 'no QC4 test cases declared' });
  for (const c of cases) {
    if (c.run === 'blind_solve') {
      const blind = job(c.case_id, 'blind_solve');
      const audit = job(c.case_id, 'verification');
      if (!done(blind, c.case_id, 'blind_solve') || !done(audit, c.case_id, 'verification')) continue;
      const key = keys.find((k) => k.item === c.target_item);
      if (!key) { findings.push({ code: 'QC4_NOT_RUN', case_id: c.case_id, detail: 'answer key unavailable to verifier' }); continue; }
      const answers = (blind!.result as { answers: { question_id: string; answer: string }[] }).answers;
      for (const a of key.answers) {
        const given = answers.find((x) => x.question_id === a.question_id)?.answer;
        if (given === undefined || !a.accepted.map(norm).includes(norm(given))) findings.push({ code: 'QC4_BLIND_SOLVE_MISMATCH', case_id: c.case_id, detail: `${a.question_id}: blind answer differs from key` });
      }
      const verdict = audit!.result as { verdict: string; competing_answers: { question_id: string }[] };
      if (verdict.verdict !== 'consistent' || verdict.competing_answers.length > 0) {
        findings.push({ code: 'QC4_COMPETING_ANSWER', case_id: c.case_id, detail: `verdict=${verdict.verdict}; competing=${verdict.competing_answers.map((x) => x.question_id).join(',') || '-'}` });
      }
    } else {
      const run = job(c.case_id, 'assessment');
      if (!done(run, c.case_id, 'assessment')) continue;
      const outcome = (run!.result as { outcome: string }).outcome;
      if (outcome !== c.expected_outcome) findings.push({ code: 'QC4_TEST_CASE_FAILED', case_id: c.case_id, detail: `expected ${c.expected_outcome}, got ${outcome}` });
    }
  }
  const synthetic = jobs.some((j) => j.providers.includes('fake'));
  if (synthetic && origin !== 'synthetic_fixture') findings.push({ code: 'QC4_SYNTHETIC_ONLY', case_id: '-', detail: 'FakeAdapter results cannot qualify sourced content' });
  const status = findings.some((f) => f.code === 'QC4_NOT_RUN') ? 'NOT_RUN' : findings.length > 0 ? 'FAIL' : 'PASS';
  return { status, method: synthetic ? 'synthetic_fake' : 'ai_semantic', findings };
}
