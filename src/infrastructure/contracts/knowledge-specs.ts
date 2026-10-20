import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateKnowledge } from './validate.js';

export interface QcRule { code: string; description: string; method: 'deterministic' | 'preliminary_filter' | 'semantic'; severity: 'blocking' | 'function_blocking' | 'warning'; applies_to: string[] }
export interface QcSpec { schema_version: '1'; qc_spec_version: string; stages: { stage: 'QC1' | 'QC2' | 'QC3' | 'QC4'; name: string; rules: QcRule[] }[] }
export interface IngestionPlaybook { schema_version: '1'; playbook_version: string; steps: { step: number; name: string; inputs: string[]; outputs: string[]; exit_criteria: string[]; blocking_conditions: string[] }[] }

function load<T>(file: string, contract: string): T {
  const value: unknown = JSON.parse(readFileSync(resolve('contracts/knowledge', file), 'utf8'));
  const checked = validateKnowledge(contract, value);
  if (!checked.ok) throw new Error(`${file} violates ${contract}: ${checked.errors.join('; ')}`);
  return value as T;
}

/** Versioned QC Specification and Ingestion Playbook (outputs 3 and 4); validated on load, never trusted blindly. */
export function loadQcSpec(): QcSpec {
  const spec = load<QcSpec>('qc-spec.v1.json', 'qc_spec');
  const stages = spec.stages.map((s) => s.stage);
  if (new Set(stages).size !== 4) throw new Error('QC spec must define QC1–QC4 exactly once');
  const codes = spec.stages.flatMap((s) => s.rules.map((r) => r.code));
  if (new Set(codes).size !== codes.length) throw new Error('QC spec has duplicate rule codes');
  for (const s of spec.stages) for (const r of s.rules) if (!r.code.startsWith(`${s.stage}_`)) throw new Error(`Rule ${r.code} is filed under ${s.stage}`);
  return spec;
}

export function loadPlaybook(): IngestionPlaybook {
  const playbook = load<IngestionPlaybook>('ingestion-playbook.v1.json', 'ingestion_playbook');
  if (playbook.steps.map((s) => s.step).join(',') !== '1,2,3,4,5,6') throw new Error('Playbook must list steps 1–6 in order');
  return playbook;
}

export function ruleOf(spec: QcSpec, code: string): QcRule {
  const rule = spec.stages.flatMap((s) => s.rules).find((r) => r.code === code);
  if (!rule) throw new Error(`QC rule ${code} is not in ${spec.qc_spec_version}`);
  return rule;
}
