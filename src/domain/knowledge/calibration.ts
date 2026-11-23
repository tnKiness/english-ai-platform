// E-55 (D-05 C6, N9, user decision "Nhập mẫu, đo định tính"): scored sample responses with examiner comments from
// the official IELTS "example responses" PDFs. Parsed deterministically from the stored text (no AI), so every field
// is a verbatim copy of the approved source. Used for a qualitative side-by-side report only: no band thresholds, no
// band estimate, band reporting stays off (N9 asks for 20–30 Task 2 samples before any band claim).
export interface ScoredSample {
  sample_id: string; source_ref: string; url: string; module: 'academic' | 'general_training'; task: 1 | 2; label: string;
  response: string; band: number; examiner_comment: string;
}

const HEADER = /^(?:Sample (Academic) Writing Part ([12])|(General Training) Writing Sample Task ([12]))\s*$/;
const LABEL = /^(Candidate Response \d+|Sample Script [A-Z])\s*$/;
const BAND = /^Band (\d(?:\.5)?)\s*$/;

/** Split the stored text of one example-responses PDF into samples (page markers `--- Trang n ---` end a comment). */
export function parseScoredSamples(text: string, meta: { source_ref: string; url: string }): ScoredSample[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out: ScoredSample[] = [];
  for (let i = 0; i < lines.length; i++) {
    const h = HEADER.exec(lines[i]!.trim());
    if (!h) continue;
    const label = LABEL.exec((lines[i + 1] ?? '').trim());
    if (!label) continue;
    let j = i + 2;
    if (/^WRITING TASK [12]\s*$/i.test((lines[j] ?? '').trim())) j++;
    const response: string[] = [];
    for (; j < lines.length && lines[j]!.trim() !== 'Examiner comment'; j++) response.push(lines[j]!);
    const band = BAND.exec((lines[j + 1] ?? '').trim());
    if (j >= lines.length || !band) continue;
    const comment: string[] = [];
    let k = j + 2;
    for (; k < lines.length && !/^--- Trang \d+ ---$/.test(lines[k]!.trim()) && !HEADER.test(lines[k]!.trim()); k++) comment.push(lines[k]!);
    const module = h[1] ? 'academic' as const : 'general_training' as const;
    const task = Number(h[2] ?? h[4]) as 1 | 2;
    out.push({ sample_id: `${module === 'academic' ? 'ac' : 'gt'}-t${task}-${label[1]!.toLowerCase().replace(/\s+/g, '-')}`, source_ref: meta.source_ref, url: meta.url, module, task,
      label: label[1]!, response: response.join('\n').trim(), band: Number(band[1]), examiner_comment: comment.join('\n').trim() });
    i = k - 1;
  }
  return out.filter((s) => s.response.length > 0 && s.examiner_comment.length > 0);
}
