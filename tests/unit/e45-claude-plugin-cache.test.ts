// E-45: the Claude runner profile may contain plugins/ with ONLY the catalogue cache Claude Code writes by itself.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CLAUDE_ALLOWED_BUILTIN_PLUGINS, inspectClaudeConfig, isClaudePluginCacheOnly } from '../../src/infrastructure/ai/gateway/probe-boundary.js';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });
function profile(files: Record<string, string | null>) {
  const root = mkdtempSync(join(tmpdir(), 'e45-')); dirs.push(root);
  const prof = join(root, 'profile'); const work = join(root, 'work');
  mkdirSync(prof); mkdirSync(work); mkdirSync(join(prof, 'plugins'));
  for (const [rel, body] of Object.entries(files)) {
    if (body === null) mkdirSync(join(prof, rel), { recursive: true }); else writeFileSync(join(prof, rel), body);
  }
  return { root, prof, work };
}
const findings = (p: ReturnType<typeof profile>) => inspectClaudeConfig(p.prof, p.work, p.root).findings;

describe('E-45 Claude plugin catalogue cache', () => {
  it('allows plugins/ holding only the catalogue cache (any version) and notes it', () => {
    const p = profile({ 'plugins/plugin-directory-cache-v2.json': '{"plugins":[]}', 'plugins/plugin-directory-cache.json': '{}' });
    const r = inspectClaudeConfig(p.prof, p.work, p.root);
    expect(r.findings).toEqual([]);
    expect(r.notes.join(' ')).toContain('E-45');
  });

  it('still blocks anything else in plugins/: installed plugins, marketplaces, other files, look-alike names', () => {
    expect(findings(profile({ 'plugins/plugin-directory-cache-v2.json': '{}', 'plugins/installed_plugins.json': '{}' }))).toContain('PROFILE_plugins');
    expect(findings(profile({ 'plugins/plugin-directory-cache-v2.json': '{}', 'plugins/marketplaces': null }))).toContain('PROFILE_plugins');
    expect(findings(profile({ 'plugins/plugin-directory-cache-v2.json': null }))).toContain('PROFILE_plugins'); // a directory, not a file
    expect(findings(profile({ 'plugins/plugin-directory-cache-v2.json.js': '{}' }))).toContain('PROFILE_plugins');
    expect(findings(profile({ 'plugins/plugin-directory-cache-vx.json': '{}' }))).toContain('PROFILE_plugins');
  });

  it('does not relax any other profile check', () => {
    const p = profile({ 'plugins/plugin-directory-cache-v2.json': '{}', 'hooks.json': '{}', 'settings.json': '{"enabledPlugins":{"x":true}}' });
    expect(findings(p)).toEqual(expect.arrayContaining(['PROFILE_hooks.json', 'SETTINGS_enabledPlugins']));
    expect(findings(p)).not.toContain('PROFILE_plugins');
    expect(isClaudePluginCacheOnly(join(p.prof, 'missing'))).toBe(false);
  });
});

describe('E-48 builtin plugin allowlist', () => {
  it('is exactly the four builtins the learner allowed; anything else still fails the probe', () => {
    expect([...CLAUDE_ALLOWED_BUILTIN_PLUGINS]).toEqual(['cc-plugin-agents-md', 'cc-plugin-telemetry', 'cc-plugin-plugin-authoring', 'cc-plugin-privacy']);
  });
  it('accepts plugins/store/ with state files of allowed builtins only (Claude Code 2.1.329)', () => {
    const root = mkdtempSync(join(tmpdir(), 'e48-')); dirs.push(root);
    const plugins = join(root, 'plugins'); mkdirSync(join(plugins, 'store'), { recursive: true });
    writeFileSync(join(plugins, 'plugin-directory-cache-v2.json'), '{}');
    writeFileSync(join(plugins, 'store', 'cc-plugin-agents-md_builtin-b049b47b3618.json'), '{}');
    expect(isClaudePluginCacheOnly(plugins)).toBe(true);
    writeFileSync(join(plugins, 'store', 'custom-paid-plugin_builtin-abcdef.json'), '{}');
    expect(isClaudePluginCacheOnly(plugins)).toBe(false);
    rmSync(join(plugins, 'store', 'custom-paid-plugin_builtin-abcdef.json'));
    mkdirSync(join(plugins, 'store', 'cc-plugin-privacy_builtin-abcdef.json'));
    expect(isClaudePluginCacheOnly(plugins)).toBe(false); // a directory, not a state file
    rmSync(join(plugins, 'store'), { recursive: true });
    mkdirSync(join(plugins, 'marketplaces'));
    expect(isClaudePluginCacheOnly(plugins)).toBe(false);
  });
});
