// Child-process environment for CLI runs (06A §8 chốt 1): built from an allowlist, never inherited wholesale.
// Only variable NAMES are ever reported; values are not logged or returned.

const ALLOW = ['SystemRoot', 'SYSTEMROOT', 'windir', 'SystemDrive', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'LANG', 'LC_ALL'];
/** Billing/credential/proxy routes that must never reach the CLI, even if a future allowlist edit admits them. */
export const BILLING_NAME = /(API_KEY|APIKEY|_TOKEN$|^TOKEN|SECRET|PASSWORD|CREDENTIAL|BASE_URL|ENDPOINT|PROXY|VERTEX|BEDROCK|AWS_|AZURE_|GOOGLE_CLOUD|GOOGLE_APPLICATION|GCLOUD|^ANTHROPIC_|^OPENAI_|^GEMINI_|^GOOGLE_API|USE_BEDROCK|USE_VERTEX)/i;

export interface ChildEnv { env: Record<string, string>; removed: string[]; leaked_billing_names: string[] }

/**
 * @param profileEnv provider-specific isolation variables (e.g. a config dir) — set only by the gateway from
 *   verified evidence, never from the parent environment.
 */
export function buildChildEnv(parent: NodeJS.ProcessEnv, sandbox: { tempDir: string; homeDir: string }, profileEnv: Record<string, string> = {}): ChildEnv {
  const env: Record<string, string> = {};
  const removed: string[] = [];
  for (const [name, value] of Object.entries(parent)) {
    if (value === undefined) continue;
    if (ALLOW.includes(name) && !BILLING_NAME.test(name)) env[name] = value;
    else removed.push(name);
  }
  const system = env.SystemRoot ?? env.SYSTEMROOT ?? 'C:\\Windows';
  Object.assign(env, {
    // Absolute entrypoints are spawned directly; PATH only needs system tools (e.g. taskkill for the supervisor).
    PATH: `${system}\\System32`, TEMP: sandbox.tempDir, TMP: sandbox.tempDir, USERPROFILE: sandbox.homeDir, HOME: sandbox.homeDir,
    APPDATA: `${sandbox.homeDir}\\AppData\\Roaming`, LOCALAPPDATA: `${sandbox.homeDir}\\AppData\\Local`,
    CI: 'true', NO_COLOR: '1', TERM: 'dumb',
  });
  for (const [name, value] of Object.entries(profileEnv)) {
    if (BILLING_NAME.test(name)) throw new Error(`Profile variable ${name} looks like a billing/credential route`);
    env[name] = value;
  }
  return { env, removed: removed.sort(), leaked_billing_names: Object.keys(env).filter((n) => BILLING_NAME.test(n)) };
}
