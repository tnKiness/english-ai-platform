// Cấu trúc bộ đối chứng & cổng chặn bật provider dự phòng (04 §6.B, 05 §8.D, 06A §3.B.7, D-05).
// Thuần (pure domain): không I/O, không tự tuyên bố đã đánh giá chất lượng chấm khi mới chỉ có dữ liệu synthetic.
import type { Outcome, VersionRef } from '../evidence/types.js';

export type BenchmarkProvider = 'codex' | 'claude-code' | 'agy';
export type BenchmarkSkill = 'reading' | 'listening' | 'writing' | 'speaking_text';
export type BenchmarkCategory =
  | 'typical_band'
  | 'error_diagnosis'
  | 'valid_exception_anti_template'
  | 'competing_answer'
  | 'low_signal_inconclusive';

export interface BenchmarkCaseSpec {
  case_id: string;
  /** 04 §6.B.1: tách riêng tập phát triển (dev) và tập đối chứng độc lập (holdout). */
  split: 'dev' | 'holdout';
  category: BenchmarkCategory;
  skill: BenchmarkSkill;
  expected_outcome: Outcome;
  item_ref: VersionRef;
}

export interface BenchmarkSuiteManifest {
  schema_version: '1';
  suite_id: string;
  version: string;
  content_origin: 'synthetic_fixture' | 'sourced';
  usage_rights: 'verified' | 'unknown';
  sources: { source_id: string; locator: string; rights_basis: string; ai_processing_allowed: boolean }[];
  skills: BenchmarkSkill[];
  rubric_refs: VersionRef[];
  cases: BenchmarkCaseSpec[];
}

export interface BenchmarkRunReport {
  schema_version: '1';
  report_id: string;
  suite_id: string;
  suite_version: string;
  suite_hash: string;
  provider: BenchmarkProvider;
  cli_version: string;
  model: string;
  content_origin: 'synthetic_fixture' | 'sourced';
  holdout_cases_evaluated: number;
  passed: boolean;
  findings: string[];
  recorded_at: string;
}

export const REQUIRED_HOLDOUT_CATEGORIES: readonly BenchmarkCategory[] = [
  'typical_band',
  'valid_exception_anti_template',
  'low_signal_inconclusive',
];

/**
 * Kiểm tra cấu trúc bộ đối chứng (04 §6.B.1, QUALITY_AND_DATA):
 * - Phải có quyền sử dụng rõ ràng (`usage_rights === 'verified'`).
 * - Phải tách `dev` và `holdout`, và không một `item_ref.id` nào của `holdout` được xuất hiện trong `dev`.
 * - Tập `holdout` phải bao phủ đủ các nhóm ca đối chứng bắt buộc (ca điển hình, ca ngoại lệ hợp lệ/chống học vẹt, ca tín hiệu yếu).
 */
export function validateBenchmarkSuite(suite: BenchmarkSuiteManifest): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (suite.schema_version !== '1') errors.push('INVALID_SCHEMA_VERSION');
  if (!suite.suite_id.trim() || !suite.version.trim()) errors.push('MISSING_SUITE_IDENTITY');
  if (suite.usage_rights !== 'verified') errors.push('BENCHMARK_RIGHTS_UNKNOWN');
  if (!suite.sources?.length || suite.sources.some((s) => !s.source_id.trim() || !s.locator.trim() || !s.rights_basis.trim() || !s.ai_processing_allowed)) errors.push('BENCHMARK_SOURCE_RIGHTS_MISSING');
  if (suite.skills.length === 0) errors.push('MISSING_SKILLS');
  if (suite.rubric_refs.length === 0) errors.push('MISSING_RUBRIC_REFS');
  if (suite.cases.length === 0) {
    errors.push('EMPTY_BENCHMARK_CASES');
    return { ok: false, errors };
  }

  const caseIds = new Set<string>();
  const devItems = new Set<string>();
  const holdoutItems = new Set<string>();
  const holdoutCategories = new Set<BenchmarkCategory>();
  let devCount = 0;
  let holdoutCount = 0;

  for (const c of suite.cases) {
    if (caseIds.has(c.case_id)) errors.push(`DUPLICATE_CASE_ID:${c.case_id}`);
    caseIds.add(c.case_id);
    if (c.split === 'dev') {
      devCount += 1;
      devItems.add(c.item_ref.id);
    } else if (c.split === 'holdout') {
      holdoutCount += 1;
      holdoutItems.add(c.item_ref.id);
      holdoutCategories.add(c.category);
    }
  }

  if (devCount === 0) errors.push('MISSING_DEV_SPLIT');
  if (holdoutCount === 0) errors.push('MISSING_HOLDOUT_SPLIT');

  for (const itemId of holdoutItems) {
    if (devItems.has(itemId)) errors.push(`HOLDOUT_LEAKED_INTO_DEV:${itemId}`);
  }

  for (const cat of REQUIRED_HOLDOUT_CATEGORIES) {
    if (!holdoutCategories.has(cat)) errors.push(`MISSING_HOLDOUT_CATEGORY:${cat}`);
  }

  return { ok: errors.length === 0, errors };
}

export interface BackupBenchmarkGateInput {
  target: {
    provider: BenchmarkProvider;
    cli_version: string;
    model: string;
    /** Nếu true (mặc định cho nội dung thật/sourced), bắt buộc bộ đối chứng phải là `sourced` đã duyệt D-05. */
    require_sourced: boolean;
  };
  suite: BenchmarkSuiteManifest | undefined;
  suite_hash: string | undefined;
  report: BenchmarkRunReport | undefined;
}

export interface BackupBenchmarkGateDecision {
  allowed: boolean;
  reasons: string[];
  /** Luôn là false khi chỉ chạy trên synthetic_fixture (D-05: không tuyên bố đã đánh giá chất lượng chấm thật). */
  scoring_quality_claimed: boolean;
}

/**
 * Cổng chặn bật provider dự phòng (04 §6.B.2, 06A §3.B.7, D-05):
 * Provider dự phòng không được kích hoạt cho failover nếu thiếu kết quả đối chứng đạt trên đúng `(provider, cli_version, model, suite_hash)`.
 */
export function evaluateBackupProviderBenchmarkGate(input: BackupBenchmarkGateInput): BackupBenchmarkGateDecision {
  const reasons: string[] = [];
  const { target, suite, suite_hash, report } = input;

  if (!suite || !suite_hash) {
    reasons.push('BACKUP_PROVIDER_BENCHMARK_SUITE_MISSING');
  } else {
    const suiteCheck = validateBenchmarkSuite(suite);
    if (!suiteCheck.ok) reasons.push(...suiteCheck.errors.map((e) => `SUITE_${e}`));
  }

  if (!report) {
    reasons.push('BACKUP_PROVIDER_BENCHMARK_MISSING');
  } else {
    if (!report.passed) reasons.push('BACKUP_PROVIDER_BENCHMARK_FAILED');
    if (report.provider !== target.provider) reasons.push('BACKUP_PROVIDER_BENCHMARK_PROVIDER_MISMATCH');
    if (report.cli_version !== target.cli_version || report.model !== target.model) {
      reasons.push('BACKUP_PROVIDER_BENCHMARK_VERSION_MISMATCH');
    }
    if (suite && suite_hash) {
      if (report.content_origin !== suite.content_origin) reasons.push('BENCHMARK_ORIGIN_MISMATCH');
      const holdoutCount = suite.cases.filter((c) => c.split === 'holdout').length;
      if (report.suite_id !== suite.suite_id || report.suite_version !== suite.version || report.suite_hash !== suite_hash) {
        reasons.push('BACKUP_PROVIDER_BENCHMARK_SUITE_MISMATCH');
      }
      if (report.holdout_cases_evaluated < holdoutCount) {
        reasons.push('BACKUP_PROVIDER_BENCHMARK_INCOMPLETE_HOLDOUT');
      }
    }
  }

  if (target.require_sourced) {
    if (!suite || suite.content_origin !== 'sourced' || !report || report.content_origin !== 'sourced') {
      reasons.push('D05_SOURCED_BENCHMARK_REQUIRED');
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
    // This gate checks provenance/completeness only, not semantic scoring quality.
    scoring_quality_claimed: false,
  };
}
