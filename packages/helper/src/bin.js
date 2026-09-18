// 필요한 프로그램(ffmpeg·yt-dlp·ollama)을 찾는다. 없으면 /health에서 그 기능만 false로 알린다.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const WINDOWS = process.platform === 'win32';

/** PATH에서 먼저 찾고, 없으면 번들 폴더를 본다 */
export function findBinary(name, bundledDir) {
  const exe = WINDOWS ? `${name}.exe` : name;
  try {
    const out = execFileSync(WINDOWS ? 'where' : 'which', [exe], { encoding: 'utf8' }).split('\n')[0].trim();
    if (out && existsSync(out)) return out;
  } catch {
    // PATH에 없다 — 번들을 본다
  }
  if (bundledDir) {
    const bundled = join(bundledDir, exe);
    if (existsSync(bundled)) return bundled;
  }
  return null;
}

export function detectFeatures(bundledDir) {
  const ffmpeg = findBinary('ffmpeg', bundledDir);
  const ytdlp = findBinary('yt-dlp', bundledDir);
  const ollama = findBinary('ollama', bundledDir);
  return {
    paths: { ffmpeg, ytdlp, ollama },
    features: {
      ffmpeg: !!ffmpeg,
      ytdlp: !!ytdlp,
      // 번역은 Ollama가 있으면 된다 (모델은 실행할 때 확인)
      translate: !!ollama,
      // TTS는 실행 명령을 지정해야 쓸 수 있다 — 되는 척하지 않는다
      tts: !!process.env.EDITON_TTS_COMMAND && !!ffmpeg,
    },
  };
}

/**
 * 외부 프로그램을 돌리며 진행률을 흘려보낸다.
 * onLine: 표준출력·표준오류 한 줄씩. 끝나면 종료 코드를 준다.
 */
export function run(command, args, { onLine, signal, cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let rest = '';
    const feed = (chunk) => {
      rest += chunk.toString();
      const lines = rest.split(/\r?\n|\r/);
      rest = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) onLine?.(line.trim());
    };
    child.stdout.on('data', feed);
    child.stderr.on('data', feed);
    child.on('error', reject);
    child.on('close', (code) => {
      if (rest.trim()) onLine?.(rest.trim());
      resolve(code ?? 0);
    });
    signal?.addEventListener('abort', () => child.kill('SIGKILL'), { once: true });
  });
}

/** yt-dlp 진행률 줄에서 퍼센트를 꺼낸다: "[download]  42.3% of 12.34MiB at ..." */
export function parseYtdlpProgress(line) {
  const m = /\[download\]\s+([\d.]+)%/.exec(line);
  return m ? Number(m[1]) : null;
}

/** ffmpeg 진행률 줄에서 처리된 시간(ms) */
export function parseFfmpegTime(line) {
  const m = /time=\s*(\d+):(\d{2}):(\d{2})(?:\.(\d+))?/.exec(line);
  if (!m) return null;
  const frac = m[4] ? Number(`0.${m[4]}`) : 0;
  return Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + frac) * 1000);
}

/** 화질 선택 → yt-dlp 포맷 문자열 */
export function ytdlpFormat(quality) {
  switch (quality) {
    case 'audio': return 'bestaudio/best';
    case '720p': return 'bestvideo[height<=720]+bestaudio/best[height<=720]';
    case 'best': return 'bestvideo+bestaudio/best';
    case '1080p':
    default: return 'bestvideo[height<=1080]+bestaudio/best[height<=1080]';
  }
}
