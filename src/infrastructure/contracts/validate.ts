import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
const ajv = new Ajv({ strict: true, allErrors: true });
addFormats.default(ajv);
const schema = JSON.parse(readFileSync(resolve('contracts/core.v1.schema.json'), 'utf8'));
ajv.addSchema(schema);
// E-11: schema_version "2" of profile/job/run (provider enum with agy). core.v1 stays frozen for version-1 documents.
const providerSchema = JSON.parse(readFileSync(resolve('contracts/provider.v2.schema.json'), 'utf8'));
ajv.addSchema(providerSchema);
const VERSIONED = new Set(['profile', 'job', 'run']);
// P2: Phần 5 six outputs (Source Registry, Knowledge Schemas, Playbook, QC Spec, Coverage, Release Manifest).
const knowledgeSchema = JSON.parse(readFileSync(resolve('contracts/knowledge.v1.schema.json'), 'utf8'));
ajv.addSchema(knowledgeSchema);
export function validateContract(name: string, value: unknown): boolean {
  const v2 = VERSIONED.has(name) && typeof value === 'object' && value !== null && (value as { schema_version?: unknown }).schema_version === '2';
  const validate = ajv.getSchema(`${v2 ? providerSchema.$id : schema.$id}#/$defs/${name}`);
  if (!validate) throw new Error(`Unknown contract: ${name}`);
  return validate(value) === true;
}

export const KNOWLEDGE_CONTRACTS = Object.keys(knowledgeSchema.$defs as Record<string, unknown>);

/** Structural check only; returns readable error paths. Semantic QC (QC2–QC4) is never replaced by this. */
export function validateKnowledge(name: string, value: unknown): { ok: boolean; errors: string[] } {
  const validate = ajv.getSchema(`${knowledgeSchema.$id}#/$defs/${name}`);
  if (!validate) throw new Error(`Unknown knowledge contract: ${name}`);
  const ok = validate(value) === true;
  return { ok, errors: ok ? [] : (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`) };
}
