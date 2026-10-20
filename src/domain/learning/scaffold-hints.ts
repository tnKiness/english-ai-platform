// Luật kiểm duyệt tiết lộ gợi mở theo nấc và điều hướng Bước 5–6 (01 Bước 4–6, 04 §2.B/D, 06 §2.3, 06A §7.C.3).
// Module thuần domain: không I/O.

export interface PreGeneratedHints {
  /** Nấc 1: Chỉ ra vị trí / đặt câu hỏi định hướng để người học tự nhận ra vấn đề. */
  level_1: string;
  /** Nấc 2: Nhắc lại quy tắc / kiến thức liên quan. */
  level_2: string;
  /** Nấc 3: Ví dụ sửa mẫu kèm giải thích ngắn và câu hỏi kiểm tra hiểu (Concept-Check). */
  level_3: string;
  concept_check_question: string;
  concept_check_expected: string;
  /** Các cụm từ đáp án/mẫu câu cấm xuất hiện ở Nấc 1 và Nấc 2. */
  forbidden_in_early_levels: string[];
}

export interface VisibleHintSlice {
  unlocked_level: 0 | 1 | 2 | 3;
  hints: { level: 1 | 2 | 3; content: string }[];
  concept_check_question: string | null;
}

/**
 * Kiểm duyệt gói gợi mở sinh sẵn trước khi lưu hoặc cấp phát (04 §2.D, 06A §7.C.3):
 * Nấc 1 và Nấc 2 tuyệt đối không được chứa đáp án trực tiếp, mẫu câu viết lại hoàn chỉnh của Nấc 3,
 * hoặc các cụm bị cấm.
 */
export function verifyHintDisclosurePolicy(bundle: PreGeneratedHints): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (!bundle.level_1.trim() || !bundle.level_2.trim() || !bundle.level_3.trim()) {
    reasons.push('EMPTY_HINT_LEVEL');
  }
  const l1 = bundle.level_1.toLowerCase();
  const l2 = bundle.level_2.toLowerCase();
  const l3 = bundle.level_3.trim().toLowerCase();
  if (l3.length > 0 && (l1.includes(l3) || l2.includes(l3))) {
    reasons.push('EARLY_HINT_LEAKS_LEVEL_3');
  }
  for (const phrase of bundle.forbidden_in_early_levels) {
    const p = phrase.trim().toLowerCase();
    if (!p) continue;
    if (l1.includes(p)) reasons.push(`LEVEL_1_LEAKS_FORBIDDEN:${phrase}`);
    if (l2.includes(p)) reasons.push(`LEVEL_2_LEAKS_FORBIDDEN:${phrase}`);
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}

/**
 * Cắt quyền trước khi trả về trình duyệt (06 §2.3, 04 §2.B):
 * Chỉ trả đúng các nấc <= unlockedLevel; không bao giờ gửi nấc tương lai xuống client.
 */
export function sliceUnlockedHints(bundle: PreGeneratedHints, unlockedLevel: number): VisibleHintSlice {
  const clamped = Math.max(0, Math.min(3, Math.floor(unlockedLevel))) as 0 | 1 | 2 | 3;
  const hints: { level: 1 | 2 | 3; content: string }[] = [];
  if (clamped >= 1) hints.push({ level: 1, content: bundle.level_1 });
  if (clamped >= 2) hints.push({ level: 2, content: bundle.level_2 });
  if (clamped >= 3) hints.push({ level: 3, content: bundle.level_3 });
  return {
    unlocked_level: clamped,
    hints,
    concept_check_question: clamped >= 3 ? bundle.concept_check_question : null,
  };
}

export type Step6Branch = 'micro_lesson' | 'fading_scaffold' | 'contextual_practice' | 'fast_track';

/**
 * Quyết định nhánh Bước 6 dựa trên kết quả Bước 4–5 (01 Bước 5–6):
 * - Nếu bản nộp gốc đã đạt ngay từ đầu và không cần mở gợi mở -> fast_track.
 * - Nếu xem lời giải trực tiếp (Nấc 3) hoặc sau 2 lần tự sửa vẫn chưa đạt hoặc chưa qua concept check -> micro_lesson.
 * - Nếu tự sửa đạt với gợi mở Nấc 1–2 -> fading_scaffold (luyện tập giảm dần gợi ý trước khi sang 7A).
 * - Nếu tự sửa đạt không cần giải thích trực tiếp ở bài ngắn nhưng cần củng cố trong ngữ cảnh -> contextual_practice.
 */
export function decideStep6Branch(input: {
  original_outcome: 'met' | 'not_met' | 'inconclusive';
  latest_repair_outcome: 'met' | 'not_met' | 'inconclusive' | null;
  repair_attempts: number;
  unlocked_hint_level: number;
  learner_choice: 'try_more' | 'direct_explanation' | null;
  concept_check_passed: boolean | null;
}): { branch: Step6Branch; ready_for_step6: boolean; offer_direct_explanation: boolean } {
  if (input.original_outcome === 'met' && input.unlocked_hint_level === 0 && input.repair_attempts === 0) {
    return { branch: 'fast_track', ready_for_step6: true, offer_direct_explanation: false };
  }
  if (input.learner_choice === 'direct_explanation' || input.unlocked_hint_level >= 3) {
    return { branch: 'micro_lesson', ready_for_step6: input.concept_check_passed === true, offer_direct_explanation: true };
  }
  if (input.latest_repair_outcome === 'met') {
    const branch: Step6Branch = input.unlocked_hint_level > 0 ? 'fading_scaffold' : 'contextual_practice';
    return { branch, ready_for_step6: true, offer_direct_explanation: false };
  }
  // Mặc định tối đa 2 lần tự sửa có hướng dẫn (01 Bước 5); nếu chạm trần mà chưa đạt thì mở đề xuất giải thích trực tiếp + concept check.
  if (input.repair_attempts >= 2 && input.learner_choice !== 'try_more') {
    return { branch: 'micro_lesson', ready_for_step6: false, offer_direct_explanation: true };
  }
  return { branch: 'micro_lesson', ready_for_step6: false, offer_direct_explanation: false };
}
