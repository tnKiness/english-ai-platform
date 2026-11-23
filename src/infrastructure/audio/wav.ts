// E-54: minimal PCM WAV handling to join TTS clips (one per script line) into one recording with short pauses.
// Only uncompressed PCM produced by Piper is accepted; all clips must share sample rate, channels and bit depth.
export interface WavFormat { sampleRate: number; channels: number; bitsPerSample: number }
export interface Wav { format: WavFormat; data: Uint8Array }

const ascii = (b: Uint8Array, at: number, n: number) => String.fromCharCode(...b.subarray(at, at + n));

export function parseWav(bytes: Uint8Array): Wav {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WAVE') throw new Error('WAV_INVALID');
  let format: WavFormat | null = null; let data: Uint8Array | null = null;
  for (let at = 12; at + 8 <= bytes.byteLength;) {
    const id = ascii(bytes, at, 4); const size = view.getUint32(at + 4, true); const body = at + 8;
    if (body + size > bytes.byteLength) throw new Error('WAV_TRUNCATED');
    if (id === 'fmt ') {
      if (view.getUint16(body, true) !== 1) throw new Error('WAV_NOT_PCM');
      format = { channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), bitsPerSample: view.getUint16(body + 14, true) };
    } else if (id === 'data') data = bytes.subarray(body, body + size);
    at = body + size + (size % 2);
  }
  if (!format || !data) throw new Error('WAV_MISSING_CHUNK');
  return { format, data };
}

export function wavDurationSeconds(w: Wav): number {
  return w.data.byteLength / (w.format.sampleRate * w.format.channels * (w.format.bitsPerSample / 8));
}

/** Concatenate PCM clips with `gapSeconds` of silence between them. */
export function joinWav(clips: Uint8Array[], gapSeconds = 0.6): Uint8Array {
  if (clips.length === 0) throw new Error('WAV_NO_CLIPS');
  const parsed = clips.map(parseWav);
  const f = parsed[0]!.format;
  if (parsed.some((p) => p.format.sampleRate !== f.sampleRate || p.format.channels !== f.channels || p.format.bitsPerSample !== f.bitsPerSample)) throw new Error('WAV_FORMAT_MISMATCH');
  const frame = f.channels * (f.bitsPerSample / 8);
  const gap = Math.round(gapSeconds * f.sampleRate) * frame;
  const total = parsed.reduce((n, p) => n + p.data.byteLength, 0) + gap * (parsed.length - 1);
  const out = new Uint8Array(44 + total);
  const v = new DataView(out.buffer);
  const put = (at: number, s: string) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); v.setUint32(4, 36 + total, true); put(8, 'WAVE'); put(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, f.channels, true); v.setUint32(24, f.sampleRate, true);
  v.setUint32(28, f.sampleRate * frame, true); v.setUint16(32, frame, true); v.setUint16(34, f.bitsPerSample, true);
  put(36, 'data'); v.setUint32(40, total, true);
  let at = 44;
  parsed.forEach((p, i) => { out.set(p.data, at); at += p.data.byteLength + (i < parsed.length - 1 ? gap : 0); });
  return out;
}

/** A short PCM tone/silence clip, for tests and fakes only. */
export function makeWav(seconds: number, format: WavFormat = { sampleRate: 16000, channels: 1, bitsPerSample: 16 }, fill = 0): Uint8Array {
  const frame = format.channels * (format.bitsPerSample / 8);
  const data = new Uint8Array(Math.round(seconds * format.sampleRate) * frame).fill(fill);
  const out = new Uint8Array(44 + data.byteLength);
  const v = new DataView(out.buffer);
  const put = (at: number, s: string) => { for (let i = 0; i < s.length; i++) out[at + i] = s.charCodeAt(i); };
  put(0, 'RIFF'); v.setUint32(4, 36 + data.byteLength, true); put(8, 'WAVE'); put(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, format.channels, true); v.setUint32(24, format.sampleRate, true);
  v.setUint32(28, format.sampleRate * frame, true); v.setUint16(32, frame, true); v.setUint16(34, format.bitsPerSample, true);
  put(36, 'data'); v.setUint32(40, data.byteLength, true); out.set(data, 44);
  return out;
}
