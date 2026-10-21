// AI gateway admin CLI (P2-3). Records non-secret D-01 evidence, account profiles and data-recipient consent; shows
// why each provider is blocked. It never reads CLI auth files and never prints env values. Only `verify` runs a
// provider CLI (a few small synthetic prompts on the user's subscription); it is meant to be started by the user.
// `probe-boundary` runs `codex sandbox` (no model call) with synthetic bait files and only reads ACLs.
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { CLI_PROVIDERS, DATA_CLASSES, EXTRA_USAGE_RECONFIRM_MS, USER_APPROVED_DATA_CLASSES, type CliProvider, type DataClass, type ProviderEvidence } from '../application/ai/subscription-guard.js';
import { gatewayFor } from '../infrastructure/ai/gateway/compose.js';
import type { EnvelopeSpec } from '../infrastructure/ai/gateway/envelope.js';
import { DEFAULT_RUNNER_WORKSPACE, runnerWorkspace } from '../infrastructure/ai/gateway/isolation.js';
import { BOUNDARY_REPORT_KIND, probeBoundary, type BoundaryReport } from '../infrastructure/ai/gateway/probe-boundary.js';
import { verifyCodex } from '../infrastructure/ai/gateway/verify-codex.js';
import { dataPaths } from '../infrastructure/files/paths.js';
import { openStore } from '../infrastructure/sqlite/store.js';

const USAGE = `Usage: npm run ai -- <command>
  status                                            why each provider is (not) usable
  recover <provider>                                after signing in again: NEEDS_VERIFICATION, then re-record evidence
  account <profile_id> <provider> <label> <runner_dir>  register a profile (state NEEDS_VERIFICATION)
  evidence <file.json> [--boundary <probe.json>]    record {"evidence":…,"envelope":…} (no secrets), then re-check;
                                                    --boundary takes file_scope_test from a PASS probe-boundary report
  consent <provider> <data_class> grant|revoke      who may receive which data (default: nobody; learner_audio never)
  consent <provider> approved grant                 E-11: grant the 5 user-approved classes to a D-01-verified provider
  confirm-extra-usage <provider> off                you checked today that extra usage / auto-recharge is OFF (valid 30 days)
  verify codex --profile <CODEX_HOME dir> [--profile-id <id>] [--model <m>] [--entrypoint <codex.exe>] [--argv '<json>'] [--out <file>]
                                                    collect D-01 evidence (runs ~8 small synthetic prompts); never sets VERIFIED
  probe-boundary codex --profile <CODEX_HOME dir> [--workspace <dir>] [--out <file>] [--entrypoint <codex.exe>] [--argv '<json>']
                                                    E-13 read-boundary test via \`codex sandbox\` (no model call); workspace default ${DEFAULT_RUNNER_WORKSPACE}`;

const flag = (args: string[], name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const isProvider = (p: string | undefined): p is CliProvider => CLI_PROVIDERS.includes(p as CliProvider);

function newestCodexExe(): string | undefined {
  const root = join(process.env.LOCALAPPDATA ?? '', 'OpenAI', 'Codex', 'bin');
  if (!existsSync(root)) return undefined;
  return readdirSync(root).map((d) => join(root, d, 'codex.exe')).filter(existsSync).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
}

async function main(args: string[]): Promise<number> {
  const [command, ...rest] = args;
  const store = await openStore(dataPaths());
  try {
    if (command === 'status') {
      for (const s of await gatewayFor(store).status()) {
        console.log(`${s.provider}: ${s.ready ? 'READY' : `BLOCKED (${s.error})`} — adapter ${s.adapter}`);
        for (const r of s.reasons) console.log(`   - ${r}`);
        for (const n of s.notes) console.log(`   · ${n}`);
        const confirmed = store.aiAccounts.latestExtraUsageConfirmation(s.provider);
        if (confirmed) console.log(`   · extra usage OFF xác nhận lúc ${confirmed}; cần xác nhận lại trước ${new Date(Date.parse(confirmed) + EXTRA_USAGE_RECONFIRM_MS).toISOString()}`);
      }
      return 0;
    }
    if (command === 'account' && rest.length === 4) {
      const [profile, provider, label, runner] = rest as [string, string, string, string];
      if (!isProvider(provider)) throw new Error(`provider must be one of ${CLI_PROVIDERS.join(', ')}`);
      store.aiAccounts.upsertAccount({ profile_id: profile, provider, label, runner_ref: resolve(runner), state: 'NEEDS_VERIFICATION' });
      console.log(`Profile ${profile} (${provider}) registered as NEEDS_VERIFICATION. No credential was read or stored.`);
      return 0;
    }
    if (command === 'evidence' && (rest.length === 1 || (rest.length === 3 && rest[1] === '--boundary'))) {
      const { evidence, envelope } = JSON.parse(readFileSync(rest[0]!, 'utf8')) as { evidence: ProviderEvidence; envelope: EnvelopeSpec };
      const boundaryFile = flag(rest, '--boundary');
      if (boundaryFile) {
        // The source evidence file is not modified; the merged record cites the report, which the gateway re-validates.
        const report = JSON.parse(readFileSync(boundaryFile, 'utf8')) as BoundaryReport;
        if (report.kind !== BOUNDARY_REPORT_KIND || report.verdict !== 'PASS' || !report.file_scope_test) {
          throw new Error(`Boundary report is not a PASS probe-boundary report (verdict ${report.verdict ?? 'unknown'}); nothing recorded.`);
        }
        evidence.isolation.file_scope_test = report.file_scope_test;
        console.log(`file_scope_test từ ${resolve(boundaryFile)}: ${report.file_scope_test.cases.join(', ')} (enforced_boundary)` +
          `; ${report.file_scope_test.config_cases?.join(', ') || 'không có ca'} (config_inspection).`);
      }
      store.aiAccounts.recordEvidence(evidence, envelope);
      // READY only if every guard check passes with this profile treated as a candidate (06A §3.B step 4).
      // Data consent is checked per job, not here: verification must not depend on what has been granted.
      const account = store.aiAccounts.account(evidence.provider);
      const gw = gatewayFor(store, { account: (p) => (p === evidence.provider && account ? { ...account, state: 'READY' } : store.aiAccounts.account(p)) });
      const { decision } = await gw.decide(evidence.provider, { billing_policy: 'subscription_only', required_capabilities: ['text', 'structured_result'], data_classes: [] });
      if (account) store.aiAccounts.upsertAccount({ ...account, provider: evidence.provider, state: decision.allowed ? 'READY' : 'NEEDS_VERIFICATION' });
      console.log(decision.allowed ? `${evidence.provider}: READY` : `${evidence.provider}: still blocked (${decision.error}): ${decision.reasons.join(', ')}`);
      return decision.allowed ? 0 : 2;
    }
    if (command === 'consent' && rest.length === 3 && rest[1] === 'approved') {
      const [provider, , action] = rest;
      if (!isProvider(provider) || action !== 'grant') throw new Error(USAGE);
      const granted = store.aiAccounts.grantUserApprovedDataClasses(provider);
      console.log(`${provider} may now receive: ${granted.join(', ')}. learner_audio is never sent (E-11).`);
      return 0;
    }
    if (command === 'consent' && rest.length === 3) {
      const [provider, dataClass, action] = rest as [string, DataClass, string];
      if (!isProvider(provider) || !DATA_CLASSES.includes(dataClass) || !['grant', 'revoke'].includes(action)) throw new Error(USAGE);
      store.aiAccounts.setConsent(provider, dataClass, action === 'grant');
      console.log(`${provider} ${action === 'grant' ? 'may now receive' : 'may no longer receive'} ${dataClass}.`);
      return 0;
    }
    if (command === 'recover' && rest.length === 1) {
      // Manual recovery (e.g. after signing in again). Quota/rate-limit pauses end on their own; this one requires
      // re-recording D-01 evidence (`ai -- evidence …`) before the profile is READY again.
      const provider = rest[0];
      if (!isProvider(provider)) throw new Error(USAGE);
      store.aiAccounts.recoverAccount(provider, 'user ran npm run ai -- recover');
      console.log(`${provider}: NEEDS_VERIFICATION. Nạp lại bằng chứng D-01 (npm run ai -- evidence … --boundary …) để về READY.`);
      return 0;
    }
    if (command === 'confirm-extra-usage' && rest.length === 2 && rest[1] === 'off') {
      const provider = rest[0];
      if (!isProvider(provider)) throw new Error(USAGE);
      const at = store.aiAccounts.confirmExtraUsageOff(provider, 'user confirmed via npm run ai -- confirm-extra-usage');
      console.log(`${provider}: extra usage / auto-recharge OFF confirmed at ${at}. Re-confirm before ${new Date(Date.parse(at) + EXTRA_USAGE_RECONFIRM_MS).toISOString()} (30 days, E-11).`);
      return 0;
    }
    if (command === 'verify' && rest[0] === 'codex') {
      const confirmed = store.aiAccounts.latestExtraUsageConfirmation('codex');
      const age = confirmed ? store.now().getTime() - Date.parse(confirmed) : NaN;
      if (!Number.isFinite(age) || age < 0 || age > EXTRA_USAGE_RECONFIRM_MS) {
        throw new Error('Before synthetic inference, confirm your Codex plan and that extra usage / auto-recharge is OFF, then run: npm run ai -- confirm-extra-usage codex off');
      }
      const profileDir = flag(rest, '--profile');
      const entrypoint = flag(rest, '--entrypoint') ?? newestCodexExe();
      if (!profileDir || !entrypoint) throw new Error(`${USAGE}\n(--profile is required; codex.exe not found under %LOCALAPPDATA%\\OpenAI\\Codex\\bin — pass --entrypoint)`);
      const argvJson = flag(rest, '--argv');
      const report = await verifyCodex({
        entrypoint: resolve(entrypoint), profileId: flag(rest, '--profile-id') ?? 'codex-main', profileDir: resolve(profileDir), model: flag(rest, '--model') ?? null,
        argv: argvJson ? (JSON.parse(argvJson) as string[]) : undefined, roots: { repo: resolve('.'), data: store.paths.root },
        scratchParent: join(tmpdir(), 'study-english-verify'), parentEnv: process.env, now: store.now,
      });
      const out = resolve(flag(rest, '--out') ?? join(store.paths.root, 'ai', `verify-codex-${store.now().toISOString().replace(/[:.]/g, '-')}.json`));
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
      console.log(report.aborted ? `Dừng sớm: ${report.aborted}` : 'Đã thu quan sát (chưa VERIFIED; probe phản hồi không chứng minh giới hạn đọc).');
      for (const c of [...report.observations.file_scope, ...report.observations.process_control]) console.log(`   ${c.passed ? 'ĐẠT ' : 'CHƯA'} ${c.case}: ${c.detail}`);
      if (report.observations.tools) console.log(`   Công cụ (E-15.2): ${report.observations.tools.ok ? 'đã tắt đủ' : `chưa đủ (${[...report.observations.tools.argv_issues, ...report.observations.tools.not_effective].join(', ')})`}`);
      for (const p of report.pending_user_confirmation) console.log(`   → ${p}`);
      console.log(`Báo cáo: ${out}\nCác loại dữ liệu sẽ cấp sau khi VERIFIED (E-11): ${USER_APPROVED_DATA_CLASSES.join(', ')}`);
      return report.aborted || !report.evidence?.output_contract.test_passed || [...report.observations.file_scope, ...report.observations.process_control].some((c) => !c.passed) ? 2 : 0;
    }
    if (command === 'probe-boundary' && rest[0] === 'codex') {
      const profileDir = flag(rest, '--profile');
      const entrypoint = flag(rest, '--entrypoint') ?? newestCodexExe();
      if (!profileDir || !entrypoint) throw new Error(`${USAGE}\n(--profile is required; codex.exe not found under %LOCALAPPDATA%\\OpenAI\\Codex\\bin — pass --entrypoint)`);
      const argvJson = flag(rest, '--argv');
      const out = resolve(flag(rest, '--out') ?? join(store.paths.root, 'ai', `probe-boundary-codex-${store.now().toISOString().replace(/[:.]/g, '-')}.json`));
      const report = await probeBoundary({
        entrypoint: resolve(entrypoint), profileDir: resolve(profileDir), workspace: resolve(flag(rest, '--workspace') ?? DEFAULT_RUNNER_WORKSPACE),
        roots: { repo: resolve('.'), data: store.paths.root }, parentEnv: process.env, reportPath: out, now: store.now,
        gatewayArgv: argvJson ? (JSON.parse(argvJson) as string[]) : undefined,
      });
      console.log(`codex ${report.codex.version} (sha256 ${report.codex.sha256.slice(0, 16)}…); sandbox: ${report.sandbox_identity.whoami ?? '?'}${report.sandbox_identity.codex_sandbox_group ? ' (CodexSandboxUsers)' : ''}`);
      console.log(`Cấu hình: cwd ${report.config.cwd}, sandbox_mode=${report.config.sandbox_mode ?? '?'}${report.config.config_overrides.map((c) => `, -c ${c}`).join('')}, CODEX_HOME ${report.config.codex_home}`);
      for (const c of report.cases) {
        const need = c.expected === 'read' ? 'đọc được' : c.expected === 'blocked' ? 'bị chặn' : 'chỉ ghi nhận';
        console.log(`   ${c.expected === 'info' ? 'INFO' : c.passed ? 'ĐẠT ' : 'CHƯA'} ${c.id} (${need}): ${c.outcome}${c.error_kind ? ` ${c.error_kind}` : ''} — ${c.target}${c.note ? ` [${c.note}]` : ''}`);
        if (c.fix) console.log(`        → ${c.fix}`);
      }
      const tools = report.tools;
      console.log(`Công cụ (E-15.2): ${tools?.ok ? `đã tắt đủ ${tools.required.length}` : `CHƯA ĐỦ — ${[...(tools?.argv_issues ?? []), ...(tools?.not_effective.length ? [`CLI vẫn bật: ${tools.not_effective.join(',')}`] : [])].join('; ') || 'không đọc được features list'}`}`);
      const cfg = report.config_inspection;
      console.log(`Cấu hình (E-15.3, config_inspection): ${cfg?.ok ? 'sạch' : `có mục cần gỡ — ${cfg?.findings.join('; ') ?? 'chưa kiểm'}`}${cfg?.notes.length ? ` (${cfg.notes.join('; ')})` : ''}`);
      console.log(`Kết luận ranh giới OS: ${report.verdict}${report.inconclusive_reasons.length ? ` (${report.inconclusive_reasons.join('; ')})` : ''}`);
      if (report.file_scope_test) {
        console.log(`file_scope_test: ${report.file_scope_test.cases.join(', ')} (enforced_boundary); ${report.file_scope_test.config_cases?.join(', ') || 'chưa có ca'} (config_inspection).` +
          ` Nạp: npm run ai -- evidence <evidence.json> --boundary "${out}"`);
      }
      if (report.config.workspace.toLowerCase() !== runnerWorkspace().toLowerCase()) {
        console.log(`Lưu ý: gateway hiện dùng ${runnerWorkspace()}, khác workspace của probe — gateway sẽ không công nhận báo cáo này (BOUNDARY_WORKSPACE_MISMATCH).`);
      }
      console.log(`Báo cáo: ${out}`);
      return report.verdict === 'PASS' ? 0 : 2;
    }
    console.error(USAGE);
    return 1;
  } finally { store.close(); }
}

process.exitCode = await main(process.argv.slice(2)).catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); return 1; });
