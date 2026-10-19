import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
const ajv = new Ajv({ strict: true, allErrors: true });
addFormats.default(ajv);
const schema = JSON.parse(readFileSync(resolve('contracts/core.v1.schema.json'), 'utf8'));
ajv.addSchema(schema);
export function validateContract(name: string, value: unknown): boolean {
  const validate = ajv.getSchema(`${schema.$id}#/$defs/${name}`);
  if (!validate) throw new Error(`Unknown contract: ${name}`);
  return validate(value) === true;
}
