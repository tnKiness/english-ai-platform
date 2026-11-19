// E-44: Piper TTS adapter, driven by a fake engine (node + script) so no real engine or voice is needed.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PiperTts, MAX_TTS_CHARS } from '../../src/infrastructure/audio/tts.js';

const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

// Fake piper: reads stdin, writes a WAV (or junk when the text says so) to --output_file, echoes its args to stderr.
const FAKE = `
const fs = require('node:fs');
const a = process.argv.slice(2); const out = a[a.indexOf('--output_file') + 1];
let text = ''; process.stdin.on('data', (d) => { text += d; }).on('end', () => {
  if (text.includes('FAIL')) process.exit(3);
  if (text.includes('JUNK')) { fs.writeFileSync(out, 'not a wav'); return; }
  const head = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')]);
  fs.writeFileSync(out, Buffer.concat([head, Buffer.from(text)]));
  process.stderr.write(JSON.stringify({ args: a, env: Object.keys(process.env) }));
});`;

function setup(withVoice = true) {
  const dir = mkdtempSync(join(tmpdir(), 'tts-test-')); dirs.push(dir);
  writeFileSync(join(dir, 'fake-piper.cjs'), FAKE);
  if (withVoice) {
    mkdirSync(join(dir, 'voices'));
    writeFileSync(join(dir, 'voices', 'en_GB-test-medium.onnx'), 'model'); writeFileSync(join(dir, 'voices', 'en_GB-test-medium.onnx.json'), '{}');
    writeFileSync(join(dir, 'voices', 'orphan.onnx'), 'model without config');
  }
  return { dir, tts: new PiperTts({ dir, executable: process.execPath, prefixArgs: [join(dir, 'fake-piper.cjs')], timeoutMs: 20_000 }) };
}

describe('E-44 Piper TTS', () => {
  it('reports what is missing without running anything', () => {
    const { dir } = setup(false);
    expect(new PiperTts({ dir }).status()).toMatchObject({ ready: false, executable_sha256: null, voices: [], issues: ['ENGINE_MISSING', 'NO_VOICE'] });
    expect(setup().tts.status()).toMatchObject({ ready: true, voices: [{ id: 'en_GB-test-medium' }] }); // a model without its config is not a voice
  });

  it('synthesises WAV from stdin (text trimmed, line endings normalised) and clamps options', async () => {
    const { tts } = setup();
    const wav = await tts.synthesize('  Good morning. Welcome to the museum tour.\r\n', 'en_GB-test-medium', { lengthScale: 9, sentenceSilence: 0.5 });
    expect(Buffer.from(wav.subarray(0, 4)).toString()).toBe('RIFF');
    expect(Buffer.from(wav.subarray(12)).toString()).toBe('Good morning. Welcome to the museum tour.\n');
  });

  it('refuses unknown voices, empty or oversized text, failed runs and non-WAV output', async () => {
    const { tts } = setup();
    await expect(tts.synthesize('Hello', '../evil')).rejects.toThrow('TTS_UNKNOWN_VOICE');
    await expect(tts.synthesize('   ', 'en_GB-test-medium')).rejects.toThrow('TTS_EMPTY_TEXT');
    await expect(tts.synthesize('x'.repeat(MAX_TTS_CHARS + 1), 'en_GB-test-medium')).rejects.toThrow('TTS_TEXT_TOO_LONG');
    await expect(tts.synthesize('FAIL please', 'en_GB-test-medium')).rejects.toThrow(/^TTS_FAILED/);
    await expect(tts.synthesize('JUNK please', 'en_GB-test-medium')).rejects.toThrow('TTS_NOT_WAV');
  });
});
