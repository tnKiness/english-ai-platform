// Dev-tooling relay, pure part. The engine (CLI adapters, quota detection, cooldowns, failover, handoff) now lives in
// ai-router; what stays here is what belongs to this project: the rules every coding run must follow and how its
// closing line maps to an exit code.

export const DONE_MARKER = 'RELAY_STATUS: DONE';
export const BLOCKED_MARKER = 'RELAY_STATUS: BLOCKED';

const RULES = [
  'Bạn là AI lập trình trong repository hiện tại, được gọi qua relay tự động (không có người trả lời câu hỏi giữa chừng).',
  'Trước khi sửa: đọc AGENTS.md và làm đúng mọi quy định trong đó, đọc PROGRESS.md và tài liệu liên quan. Kiểm tra file thực tế.',
  'Không commit, không push, không dùng cờ bỏ qua sandbox/quyền, không đọc hoặc in credential.',
];
const ENDING = [
  '## Kết thúc',
  'Khi xong, ghi kết quả thật và lệnh đã chạy vào PROGRESS.md theo mẫu bàn giao trong file đó.',
  'Nếu phải dừng giữa chừng vì hạn mức sử dụng: ghi phần đã làm và phần còn lại vào PROGRESS.md trước khi dừng. Không dùng BLOCKED cho trường hợp này.',
  `Ngoài trường hợp đó, dòng cuối cùng của câu trả lời phải là đúng một trong hai: "${DONE_MARKER}" hoặc "${BLOCKED_MARKER} <lý do cần người dùng quyết định>".`,
];

/** The prompt of a new task. */
export function buildPrompt(task: string): string {
  return [...RULES, '', '## Nhiệm vụ', task.trim(), '', ...ENDING].join('\n');
}

/** The prompt of `--continue`: same conversation in ai-router, so the task itself is already there. */
export function continuePrompt(): string {
  return [
    'Tiếp tục nhiệm vụ đang dở của cuộc trò chuyện này.',
    'Phần việc có thể đã làm dở. Đọc thay đổi chưa commit và PROGRESS.md, tiếp tục phần còn thiếu; không làm lại phần đã xong, không xóa thay đổi đang có trừ khi chúng sai rõ ràng.',
    RULES[2] as string, '', ...ENDING,
  ].join('\n');
}

export interface RouterResult { status: 'DONE' | 'STOPPED' | 'EXHAUSTED' | 'FAILED'; threadId: string; providerId: string | null; finalText: string; reason: string | null; nextResetAt: string | null }
export type RelayStatus = 'DONE' | 'BLOCKED' | 'EXHAUSTED' | 'STOPPED';

/** Reason after the BLOCKED marker on the last non-empty line, or null when the answer does not end with it. */
export function blockedReason(finalText: string): string | null {
  const last = finalText.trim().split(/\r?\n/).at(-1)?.trim() ?? '';
  return last.startsWith(BLOCKED_MARKER) ? last.slice(BLOCKED_MARKER.length).trim() || '(không nêu lý do)' : null;
}

/** 0 done, 2 the AI needs a decision from the user, 75 no provider left, 1 anything else. */
export function relayOutcome(r: RouterResult): { status: RelayStatus; exitCode: number; note: string } {
  if (r.status === 'EXHAUSTED') return { status: 'EXHAUSTED', exitCode: 75, note: `Không còn nền tảng khả dụng.${r.nextResetAt ? ` Sớm nhất mở lại lúc ${new Date(r.nextResetAt).toLocaleString('vi-VN', { hour12: false })}.` : ''} Chạy lại với --continue (hoặc thêm --wait).` };
  if (r.status !== 'DONE') return { status: 'STOPPED', exitCode: r.status === 'STOPPED' ? 130 : 1, note: `Dừng: ${r.reason ?? r.status}. Chạy --continue để tiếp tục.` };
  const blocked = blockedReason(r.finalText);
  if (blocked) return { status: 'BLOCKED', exitCode: 2, note: `AI cần người dùng quyết định: ${blocked}` };
  return { status: 'DONE', exitCode: 0, note: 'AI báo hoàn thành. Xem PROGRESS.md và git diff trước khi commit.' };
}
