// Local TTS CLI (E-44, D-06 Listening). Offline: Piper runs on this machine; nothing is sent anywhere.
import { dataPaths } from '../infrastructure/files/paths.js';
import { PiperTts } from '../infrastructure/audio/tts.js';
import { openStore } from '../infrastructure/sqlite/store.js';

const USAGE = `Cách dùng: npm.cmd run tts -- <lệnh>
  status                         engine Piper và các giọng đã cài (thư mục: %LOCALAPPDATA%\\study-english\\tts hoặc STUDY_ENGLISH_TTS_DIR)
  say "<văn bản>" [--voice <id>]  đọc thử, lưu WAV vào kho media cục bộ và in đường dẫn`;

async function main(args: string[]): Promise<number> {
  const [command, text] = args;
  const tts = new PiperTts();
  if (command === 'status') {
    const s = tts.status();
    console.log(`Thư mục: ${s.dir}`);
    console.log(`Engine: ${s.executable} ${s.executable_sha256 ? `(sha256 ${s.executable_sha256.slice(0, 16)}…)` : '— CHƯA CÀI'}`);
    console.log(`Giọng: ${s.voices.map((v) => v.id).join(', ') || '— chưa có'}`);
    console.log(s.ready ? 'Sẵn sàng.' : `Chưa sẵn sàng: ${s.issues.join(', ')}`);
    return s.ready ? 0 : 2;
  }
  if (command === 'say' && text) {
    const i = args.indexOf('--voice');
    const voice = i >= 0 ? args[i + 1] : tts.voices()[0]?.id;
    if (!voice) { console.log('Chưa có giọng nào. Chạy `npm.cmd run tts -- status`.'); return 2; }
    const wav = await tts.synthesize(text, voice);
    const store = await openStore(dataPaths());
    try {
      const ref = store.media.put(wav, 'audio/wav');
      console.log(`Đã tạo ${Math.round(wav.byteLength / 1024)} KB bằng giọng ${voice}: ${ref.media_id} (${ref.rel_path})`);
    } finally { store.close(); }
    return 0;
  }
  console.log(USAGE);
  return command ? 1 : 0;
}
process.exitCode = await main(process.argv.slice(2)).catch((e: unknown) => { console.error(e instanceof Error ? e.message : String(e)); return 1; });
