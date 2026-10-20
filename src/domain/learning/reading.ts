// 03 §3: item correctness is separate from diagnosis and measurement.
export interface ReadingAnswer { question_id: string; answer: string; rationale: string }
export interface ReadingKey {
  item: { id: string; version: string };
  answers: { question_id: string; accepted: string[]; explanation: string; evidence_locator: string }[];
  measurement_targets: string[];
  competing_answers_considered: string[];
}
export const normalizeReadingAnswer = (s: string) => s.trim().replace(/\s+/g, ' ').toUpperCase();

export function scoreReading(key: ReadingKey, answers: ReadingAnswer[]) {
  return key.answers.map((k) => {
    const a = answers.find((a) => a.question_id === k.question_id);
    return {
      question_id: k.question_id,
      item_result: !a?.answer.trim() ? 'unanswered' : k.accepted.some((v) => normalizeReadingAnswer(v) === normalizeReadingAnswer(a.answer)) ? 'correct' : 'incorrect',
      // A written rationale is stored, not automatically judged correct by substring matching.
      diagnostic_value: 'inconclusive',
      repair_verification: 'not_verified',
      measurement_quality: 'qc4_checked_synthetic',
    };
  });
}

// Generic, reviewed teaching prompts; neither selects an answer nor uses outside knowledge.
export const READING_HINTS = [
  'Đối chiếu từng mệnh đề với bài đọc; có thể giải thích ngắn bằng tiếng Việt.',
  'Phân biệt thông tin hỗ trợ, mâu thuẫn trực tiếp và thông tin còn thiếu. Với Not Given, nêu thông tin cần có nhưng bài không cung cấp; không cần tìm một câu chứng minh sự vắng mặt.',
] as const;
