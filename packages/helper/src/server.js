// 편집ON 내 컴퓨터 도우미.
// 규칙: 127.0.0.1에만 바인딩(외부 접속 불가), 모든 요청에 토큰 검사, 허용된 출처만 CORS.
import { spawn } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import Fastify from 'fastify';
import { detectFeatures, parseFfmpegTime, parseYtdlpProgress, run, ytdlpFormat } from './bin.js';
import { bearerToken, loadOrCreateToken, tokenMatches } from './token.js';

export const HOST = '127.0.0.1';
export const PORT = 47_600;
export const VERSION = '1.0.0';

/** 로컬 개발 주소와 배포 도메인만 허용한다 */
export const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:3100'];

export function allowedOrigins(extra = process.env.EDITON_ORIGINS) {
  const fromEnv = (extra ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return [...DEFAULT_ORIGINS, ...fromEnv];
}

export function defaultOutDir() {
  const dir = process.env.EDITON_OUT_DIR || join(homedir(), 'Videos', 'EditON');
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** SSE 한 줄 보내기 */
function sse(reply, event) {
  reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
}

function startSse(reply) {
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });
}

/** 네이티브 폴더 선택창 (OS별 명령). 실패하면 기본 폴더를 돌려준다 */
async function pickFolderNative() {
  const fallback = defaultOutDir();
  try {
    if (process.platform === 'darwin') {
      const script = 'POSIX path of (choose folder with prompt "저장할 폴더를 고르세요")';
      const out = await new Promise((res, rej) => {
        const p = spawn('osascript', ['-e', script]);
        let buf = '';
        p.stdout.on('data', (d) => { buf += d.toString(); });
        p.on('error', rej);
        p.on('close', () => res(buf.trim()));
      });
      return out || fallback;
    }
    if (process.platform === 'win32') {
      const ps = 'Add-Type -AssemblyName System.Windows.Forms; $d=New-Object System.Windows.Forms.FolderBrowserDialog; if($d.ShowDialog() -eq "OK"){$d.SelectedPath}';
      const out = await new Promise((res, rej) => {
        const p = spawn('powershell', ['-NoProfile', '-Command', ps]);
        let buf = '';
        p.stdout.on('data', (d) => { buf += d.toString(); });
        p.on('error', rej);
        p.on('close', () => res(buf.trim()));
      });
      return out || fallback;
    }
    const out = await new Promise((res) => {
      const p = spawn('zenity', ['--file-selection', '--directory']);
      let buf = '';
      p.stdout.on('data', (d) => { buf += d.toString(); });
      p.on('error', () => res(''));
      p.on('close', () => res(buf.trim()));
    });
    return out || fallback;
  } catch {
    return fallback;
  }
}

function openFolderNative(path) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
  spawn(cmd, [path], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

export async function createServer({ token, bundledDir, logger = false } = {}) {
  const app = Fastify({ logger });
  const secret = token ?? loadOrCreateToken();
  const origins = allowedOrigins();

  await app.register(cors, { origin: origins, methods: ['GET', 'POST', 'OPTIONS'], allowedHeaders: ['authorization', 'content-type', 'accept'] });
  await app.register(multipart, { limits: { fileSize: 4 * 1024 * 1024 * 1024 } });

  // 토큰이 없거나 틀리면 401. 열려 있는 문은 만들지 않는다
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') return;
    if (!tokenMatches(secret, bearerToken(req.headers.authorization))) {
      await reply.code(401).send({ error: 'unauthorized', hint: '웹앱 설정에 도우미 토큰을 넣어 주세요.' });
    }
  });

  app.get('/health', async () => {
    const { features, paths } = detectFeatures(bundledDir);
    return {
      ok: true,
      version: VERSION,
      features,
      paths,
      models: { translate: [process.env.EDITON_TRANSLATE_MODEL || 'qwen3:4b'], tts: [process.env.EDITON_TTS_MODEL || 'qwen3-tts-0.6b'] },
      outDir: defaultOutDir(),
    };
  });

  app.post('/youtube/download', async (req, reply) => {
    const { paths } = detectFeatures(bundledDir);
    if (!paths.ytdlp) {
      return reply.code(503).send({ error: 'ytdlp_missing', hint: 'yt-dlp를 설치한 뒤 도우미를 다시 켜 주세요. (brew install yt-dlp)' });
    }
    const { url, quality = '1080p', outDir } = req.body ?? {};
    if (typeof url !== 'string' || !/^https?:\/\//.test(url)) {
      return reply.code(400).send({ error: 'bad_url', hint: '유튜브 주소를 확인해 주세요.' });
    }
    const dir = outDir || defaultOutDir();
    mkdirSync(dir, { recursive: true });
    const template = join(dir, '%(title).80s.%(ext)s');

    startSse(reply);
    let filePath = '';
    const args = ['-f', ytdlpFormat(quality), '--newline', '--no-playlist', '-o', template, '--print', 'after_move:filepath', url];
    if (quality === 'audio') args.unshift('-x', '--audio-format', 'wav');
    const code = await run(paths.ytdlp, args, {
      onLine: (line) => {
        const pct = parseYtdlpProgress(line);
        if (pct !== null) sse(reply, { type: 'progress', done: Math.round(pct * 10), total: 1000, message: '내려받는 중' });
        else if (line.startsWith('/') || /^[A-Za-z]:\\/.test(line)) filePath = line;
      },
    });
    if (code !== 0 || !filePath) {
      sse(reply, { type: 'error', message: '영상을 받지 못했습니다.' });
      reply.raw.end();
      return reply;
    }
    const size = existsSync(filePath) ? statSync(filePath).size : 0;
    sse(reply, { type: 'result', result: { filePath, title: basename(filePath), fileSize: size, durationMs: 0 } });
    reply.raw.end();
    return reply;
  });

  app.post('/ffmpeg/run', async (req, reply) => {
    const { paths } = detectFeatures(bundledDir);
    if (!paths.ffmpeg) return reply.code(503).send({ error: 'ffmpeg_missing', hint: 'ffmpeg를 설치한 뒤 도우미를 다시 켜 주세요.' });
    const { args, outPath, durationMs = 0 } = req.body ?? {};
    if (!Array.isArray(args) || args.some((a) => typeof a !== 'string')) {
      return reply.code(400).send({ error: 'bad_args' });
    }
    startSse(reply);
    const code = await run(paths.ffmpeg, args, {
      onLine: (line) => {
        const t = parseFfmpegTime(line);
        if (t !== null && durationMs > 0) sse(reply, { type: 'progress', done: Math.min(durationMs, t), total: durationMs, message: '만드는 중' });
      },
    });
    if (code !== 0) sse(reply, { type: 'error', message: `ffmpeg 실패 (코드 ${code})` });
    else sse(reply, { type: 'result', result: { outPath, size: outPath && existsSync(outPath) ? statSync(outPath).size : 0 } });
    reply.raw.end();
    return reply;
  });

  app.post('/translate', async (req, reply) => {
    const { paths } = detectFeatures(bundledDir);
    if (!paths.ollama) return reply.code(503).send({ error: 'ollama_missing', hint: 'Ollama를 설치하면 이 컴퓨터에서 번역할 수 있습니다.' });
    const { cues = [], tone = 'literal', glossary = {}, mode = 'fast' } = req.body ?? {};
    const model = process.env.EDITON_TRANSLATE_MODEL || 'qwen3:4b';
    startSse(reply);
    const out = [];
    const batchSize = 20;
    for (let i = 0; i < cues.length; i += batchSize) {
      const batch = cues.slice(i, i + batchSize);
      const terms = Object.entries(glossary).map(([k, v]) => `${k}=${v}`).join(', ');
      const prompt = [
        '너는 영상 자막 번역가다. 아래 JSON 문자열 배열을 한국어로 옮겨라.',
        `말투: ${tone}. 줄 수를 바꾸지 말고 JSON 배열만 출력하라.`,
        terms ? `용어: ${terms}` : '',
        JSON.stringify(batch.map((c) => c.text)),
      ].filter(Boolean).join('\n');

      const res = await fetch('http://127.0.0.1:11434/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt, stream: false, options: { temperature: 0.2 } }),
      }).catch(() => null);
      const text = res && res.ok ? ((await res.json()).response ?? '') : '';
      let parsed = null;
      try {
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start >= 0 && end > start) parsed = JSON.parse(text.slice(start, end + 1));
      } catch {
        parsed = null;
      }
      batch.forEach((c, k) => out.push({ ...c, translated: (parsed?.[k] ?? '').toString().trim() || c.text }));
      sse(reply, { type: 'progress', done: out.length, total: cues.length, message: mode === 'precise' ? '번역·재검수 중' : '번역하는 중' });
    }
    sse(reply, { type: 'result', result: out });
    reply.raw.end();
    return reply;
  });

  app.post('/tts/generate', async (req, reply) => {
    const { text, refAudioPath, refText, emotion } = req.body ?? {};
    const command = process.env.EDITON_TTS_COMMAND;
    if (!command) {
      return reply.code(503).send({
        error: 'tts_not_configured',
        hint: 'TTS 실행 명령을 EDITON_TTS_COMMAND 환경변수로 지정해 주세요. (예: python /path/qwen3_tts.py)',
      });
    }
    if (typeof text !== 'string' || !text.trim()) return reply.code(400).send({ error: 'empty_text' });
    const outPath = join(defaultOutDir(), `tts-${Date.now()}.wav`);
    startSse(reply);
    const [cmd, ...base] = command.split(' ');
    const args = [...base, '--text', text, '--out', outPath];
    if (refAudioPath) args.push('--ref-audio', refAudioPath);
    if (refText) args.push('--ref-text', refText);
    if (emotion) args.push('--emotion', emotion);
    const code = await run(cmd, args, { onLine: (line) => sse(reply, { type: 'progress', done: 0, total: 0, message: line.slice(0, 120) }) });
    if (code !== 0 || !existsSync(outPath)) sse(reply, { type: 'error', message: '음성을 만들지 못했습니다.' });
    else sse(reply, { type: 'result', result: { wavPath: outPath } });
    reply.raw.end();
    return reply;
  });

  app.post('/fs/pick-folder', async () => ({ path: await pickFolderNative() }));

  app.post('/fs/open-folder', async (req) => {
    const path = req.body?.path || defaultOutDir();
    if (existsSync(path)) openFolderNative(path);
    return { ok: existsSync(path) };
  });

  // 브라우저가 만든 파일을 받아 지정한 폴더에 저장한다
  app.post('/fs/save', async (req, reply) => {
    const parts = req.parts();
    let dir = defaultOutDir();
    let saved = '';
    for await (const part of parts) {
      if (part.type === 'field' && part.fieldname === 'dir' && part.value) dir = String(part.value);
      if (part.type === 'file') {
        mkdirSync(dir, { recursive: true });
        saved = join(dir, basename(part.filename || `editon-${Date.now()}`));
        await pipeline(part.file, (await import('node:fs')).createWriteStream(saved));
      }
    }
    if (!saved) return reply.code(400).send({ error: 'no_file' });
    return { path: saved };
  });

  // 도우미가 만든 파일을 브라우저로 돌려준다 (유튜브 받은 영상 등)
  app.get('/fs/read', async (req, reply) => {
    const path = resolve(String(req.query?.path ?? ''));
    if (!path || !existsSync(path) || !statSync(path).isFile()) return reply.code(404).send({ error: 'not_found' });
    return reply.type('application/octet-stream').send(createReadStream(path));
  });

  // 임시 파일 저장소 (웹앱이 ffmpeg에 넘길 입력을 올릴 때)
  app.post('/fs/temp', async (req, reply) => {
    const parts = req.parts();
    let saved = '';
    for await (const part of parts) {
      if (part.type === 'file') {
        const dir = join(tmpdir(), 'editon-helper');
        mkdirSync(dir, { recursive: true });
        saved = join(dir, `${Date.now()}-${basename(part.filename || 'input')}`);
        await pipeline(part.file, (await import('node:fs')).createWriteStream(saved));
      }
    }
    if (!saved) return reply.code(400).send({ error: 'no_file' });
    return { path: saved };
  });

  return { app, token: secret };
}

export async function start(options = {}) {
  const { app, token } = await createServer(options);
  await app.listen({ host: HOST, port: PORT });
  return { app, token, url: `http://${HOST}:${PORT}` };
}

export { readFile, writeFile };
