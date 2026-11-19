// E-45: the Claude runner profile may contain plugins/ with ONLY the catalogue cache Claude Code writes by itself.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { inspectClaudeConfig, isClaudePluginCacheOnly } from '../../src/infrastructure/ai/gateway/probe-boundary.js';

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
