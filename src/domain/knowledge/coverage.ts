// Test & Coverage Manifest evaluation (05 §5.C QC1): a missing category blocks only the usage role needing it.
export type CoverageCategory = 'pass' | 'fail' | 'valid_exception' | 'inconclusive' | 'support_content' | 'test_case';
export type UsageRole = 'teach' | 'practice' | 'diagnose' | 'independent_verification';
export interface CoverageInput {
  functions: { usage_role: UsageRole; required_categories: CoverageCategory[] }[];
  entries: { category: CoverageCategory; units: unknown[] }[];
  test_cases: unknown[];
}
export interface Grant { usage_role: UsageRole; granted: boolean; blocked_reasons: string[] }

export function evaluateCoverage(manifest: CoverageInput, requested: readonly UsageRole[]): Grant[] {
  const present = new Set(manifest.entries.filter((e) => e.units.length > 0).map((e) => e.category));
  if (manifest.test_cases.length > 0) present.add('test_case');
  return requested.map((role) => {
    const fn = manifest.functions.find((f) => f.usage_role === role);
    if (!fn) return { usage_role: role, granted: false, blocked_reasons: ['NO_COVERAGE_REQUIREMENT_DECLARED'] };
    const missing = fn.required_categories.filter((c) => !present.has(c));
    return { usage_role: role, granted: missing.length === 0, blocked_reasons: missing.map((c) => `MISSING_${c.toUpperCase()}`) };
  });
}
