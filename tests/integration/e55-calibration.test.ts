// E-55 (D-05 C6, N9): official scored samples parsed verbatim from the stored PDF text; the Task 2 assessor runs once
// per Task 2 sample; the report sets examiner bands and comments beside per-criterion outcomes without any threshold or
// band estimate. Stub executor: no real AI here.
import { afterEach, describe, expect, it } from 'vitest';
import type { AdapterResult, WritingAssessment } from '../../src/application/ai/provider-adapter.js';
import type { FrameworkDocument } from '../../src/application/authoring/framework-authoring.js';
import { CalibrationService, calibrationMarkdown, PROMPT_UNAVAILABLE } from '../../src/application/authoring/calibration.js';
import { parseScoredSamples } from '../../src/domain/knowledge/calibration.js';
import { fixture, type Fixture } from './p1-helpers.js';

const TEXT = `--- Trang 1 ---
Sample Candidate Writing Responses and Examiner Comments
Introductory text about Band scores.
--- Trang 2 ---
Sample Academic Writing Part 1
Candidate Response 1
The chart shows three lines.
Examiner comment
Band 6
Key features are covered.
--- Trang 3 ---
Sample Academic Writing Part 2
Candidate Response 2
WRITING TASK 2
I agree that people will be healthier.
Firstly, medicine improves.
Examiner comment
Band 7.5
A clear position is presented.
Ideas are logically organised.
--- Trang 4 ---
General Training Writing Sample Task 2
Sample Script A
Who should be responsible.
Examiner comment
Band 5
Ideas are not sufficiently developed.
`;
const FW = { framework_id: 'ielts-writing-task2', version: 'v3', author: { synthetic: false },
  competencies: [{ competency_id: 'wt2.tr.clear_position', criterion: 'task_response', title_vi: 'Lập trường', assessor_criterion: 'Clear position.' },
    { competency_id: 'wt2.cc.logical_organisation', criterion: 'coherence_cohesion', title_vi: 'Tổ chức', assessor_criterion: 'Organised.' }] } as unknown as FrameworkDocument;

let f: Fixture | undefined;
afterEach(() => { f?.cleanup(); f = undefined; });

describe('E-55 calibration (qualitative)', () => {
  it('parses samples verbatim with band and examiner comment; page markers end a comment', () => {
    const s = parseScoredSamples(TEXT, { source_ref: 'src@v1', url: 'https://ielts.example/x.pdf' });
    expect(s.map((x) => [x.sample_id, x.task, x.band])).toEqual([['ac-t1-candidate-response-1', 1, 6], ['ac-t2-candidate-response-2', 2, 7.5], ['gt-t2-sample-script-a', 2, 5]]);
    expect(s[1]).toMatchObject({ response: 'I agree that people will be healthier.\nFirstly, medicine improves.', examiner_comment: 'A clear position is presented.\nIdeas are logically organised.' });
  });

  it('assesses Task 2 samples only, without the prompt or any band, and reports side by side', async () => {
    f = await fixture();
    const payloads: Record<string, unknown>[] = [];
    const svc = new CalibrationService(f.store, () => ({ samples: parseScoredSamples(TEXT, { source_ref: 'src@v1', url: 'u' }), missing: [] }), () => FW);
    const r = await svc.run(async (payload) => {
      payloads.push(payload);
      const result: WritingAssessment = { schema_version: '1', job_id: 'j', context_manifest_id: 'm', synthetic: false, processing: 'processed', limitations: [],
        competencies: [
          { competency_id: 'wt2.tr.clear_position', outcome: 'met', measurement_quality: 'sufficient', opportunity: 'observed', evidence_refs: [], rationale: 'Clear.' },
          { competency_id: 'wt2.cc.logical_organisation', outcome: 'not_met', measurement_quality: 'sufficient', opportunity: 'observed', evidence_refs: [], rationale: 'Jumps.' },
          { competency_id: 'wt2.lr.unasked', outcome: 'met', measurement_quality: 'sufficient', opportunity: 'observed', evidence_refs: [], rationale: 'x' },
        ],
        diagnosis: { priority_issues: [{ competency_id: 'wt2.cc.logical_organisation', location: 'p2', symptom: 'Ý nhảy.', hypothesis: 'h', expected_verification: 'v', impact: 2, certainty: 2 }], other_issues: [], hints: null } };
      return { result: { ok: true, result } as AdapterResult, provider: 'claude-code', cli_version: '1', model: 'm' };
    });
    expect(payloads).toHaveLength(2); // two Task 2 samples; Task 1 not assessed
    expect(payloads[0]).toMatchObject({ task: { prompt: PROMPT_UNAVAILABLE }, submission_text: 'I agree that people will be healthier.\nFirstly, medicine improves.' });
    expect(JSON.stringify(payloads)).not.toMatch(/Band|7\.5|A clear position is presented/); // no examiner band or comment reaches the assessor
    expect(r).toMatchObject({ samples: 3, assessed: 2, band_reporting_enabled: false });
    expect(r.rows[0]).toMatchObject({ task: 1, assessed: false, error: 'TASK1_NO_FRAMEWORK' });
    expect(r.rows[1]!.by_criterion).toEqual([{ criterion: 'task_response', met: 1, not_met: 0, inconclusive: 0 }, { criterion: 'coherence_cohesion', met: 0, not_met: 1, inconclusive: 0 }]);
    const md = calibrationMarkdown(r);
    expect(md).toContain('giám khảo: Band 7.5');
    expect(md).toContain('A clear position is presented.');
    expect(md).toContain('Báo Band: TẮT');
    expect(md).not.toMatch(/ước lượng Band|predicted band/i);
  });

  it('refuses without an approved framework', async () => {
    f = await fixture();
    await expect(new CalibrationService(f.store, () => ({ samples: [], missing: [] }), () => null).run(async () => { throw new Error('no call'); })).rejects.toMatchObject({ code: 'FRAMEWORK_NOT_APPROVED' });
  });
});
