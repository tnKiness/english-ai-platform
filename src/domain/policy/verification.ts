// D-02 v1 section C (E-33): verification chain 7A → 7B → Bước 9 and spaced maintenance. Pure, no I/O.
// Competency levels are never changed here (A7 decides demotion); this only says what to schedule next.
import type { Opportunity, Outcome } from '../evidence/types.js';
import { DAY_MS, type CompetencyPolicyParams } from './params.js';

export type VerificationPurpose = '7A' | '7B' | '9';
export type ScheduleReason = 'C1_AFTER_7A' | 'C2_STEP9_INTERVAL' | 'C3_7B_RETRY' | 'C3_STEP9_RESET' | 'C4_DIRECT_CHECK';

export interface ScheduleAction { purpose: '7B' | '9'; due_in_days: number; step9_index: number | null; interval_days: number; reason: ScheduleReason; constraint: 'semantic' | null }
export interface VerificationResult {
  /** New task to schedule, if any. */
  schedule: ScheduleAction | null;
  /** C3: 7A not met → back to Bước 6 consolidation (no forced 7A retake at the start of a session). */
  back_to_step6: boolean;
  /** C3: 7B not met → contextual practice before the retry. */
  contextual_practice: boolean;
  /** C4: no opportunity / unmeasurable → the task waits; counted toward the direct-check trigger when absent. */
  awaiting_opportunity: boolean;
  notes: string[];
}

export interface VerificationEvent {
  purpose: VerificationPurpose;
  /** Whether the result came from independent evidence (A/B definitions); non-independent results never advance the chain. */
  independent: boolean;
  outcome: Outcome;
  opportunity: Opportunity;
  /** Index into step9_intervals_days of the check just done (null for 7A/7B). */
  step9_index: number | null;
}

const step9 = (p: CompetencyPolicyParams, index: number, reason: ScheduleReason): ScheduleAction => {
  const i = Math.min(index, p.schedule.step9_intervals_days.length - 1);
  const days = reason === 'C3_STEP9_RESET' ? p.schedule.step9_reset_days : p.schedule.step9_intervals_days[i]!;
  return { purpose: '9', due_in_days: days, step9_index: i, interval_days: days, reason, constraint: null };
};

export function afterVerification(e: VerificationEvent, p: CompetencyPolicyParams): VerificationResult {
  const none: VerificationResult = { schedule: null, back_to_step6: false, contextual_practice: false, awaiting_opportunity: false, notes: [] };
  if (e.opportunity !== 'observed' || e.outcome === 'inconclusive') {
    return { ...none, awaiting_opportunity: true, notes: ['C4: chưa có cơ hội quan sát hoặc chưa đo được — không tính đạt/chưa đạt, không đổi khoảng cách'] };
  }
  if (!e.independent) return { ...none, awaiting_opportunity: true, notes: ['Kết quả không phải bằng chứng độc lập — chưa dùng để chuyển bậc kiểm chứng'] };
  if (e.purpose === '7A') {
    return e.outcome === 'met'
      ? { ...none, schedule: { purpose: '7B', due_in_days: p.schedule.after_7a_days, step9_index: null, interval_days: p.schedule.after_7a_days, reason: 'C1_AFTER_7A', constraint: null }, notes: ['C1: đạt 7A → xếp 7B từ ngày hôm sau'] }
      : { ...none, back_to_step6: true, notes: ['C3: 7A chưa đạt → quay về củng cố Bước 6, không ép làm lại 7A ngay đầu buổi'] };
  }
  if (e.purpose === '7B') {
    return e.outcome === 'met'
      ? { ...none, schedule: step9(p, 0, 'C2_STEP9_INTERVAL'), notes: ['C1: đạt 7B → mở chuỗi Bước 9'] }
      : { ...none, contextual_practice: true, schedule: { purpose: '7B', due_in_days: p.schedule.retry_7b_days, step9_index: null, interval_days: p.schedule.retry_7b_days, reason: 'C3_7B_RETRY', constraint: null },
        notes: [`C3: 7B chưa đạt → luyện trong ngữ cảnh đoạn/bài rồi xếp lại 7B sau ${p.schedule.retry_7b_days} ngày`] };
  }
  const index = e.step9_index ?? 0;
  return e.outcome === 'met'
    ? { ...none, schedule: step9(p, index + 1, 'C2_STEP9_INTERVAL'), notes: ['C2: đạt Bước 9 → giãn khoảng cách'] }
    : { ...none, schedule: step9(p, 0, 'C3_STEP9_RESET'), notes: [`C3: Bước 9 chưa đạt → quay về khoảng ${p.schedule.step9_reset_days} ngày`] };
}

/** C4: switch to a short task with a situational (semantic) constraint after repeated absent opportunities or a long wait. */
export function needsDirectCheck(input: { absent_count: number; due_at: string; now: Date }, p: CompetencyPolicyParams): boolean {
  const waitedDays = (input.now.getTime() - Date.parse(input.due_at)) / DAY_MS;
  return input.absent_count >= p.schedule.absent_composites_before_direct_check || waitedDays > p.schedule.absent_wait_days_before_direct_check;
}

export type VerificationStatus = 'not_due' | 'due' | 'awaiting_opportunity' | 'recheck';

/** C5: overdue only changes the verification status, never the competency level. */
export function verificationStatus(input: { due_at: string; interval_days: number | null; awaiting: boolean; now: Date }, p: CompetencyPolicyParams): VerificationStatus {
  if (input.awaiting) return 'awaiting_opportunity';
  const overdueMs = input.now.getTime() - Date.parse(input.due_at);
  if (overdueMs < 0) return 'not_due';
  const interval = Math.max(1, input.interval_days ?? 1);
  return overdueMs > p.schedule.recheck_overdue_factor * interval * DAY_MS ? 'recheck' : 'due';
}
