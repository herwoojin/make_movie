#!/usr/bin/env node
// 실행하면 토큰을 보여 주고 127.0.0.1:47600 에서 기다린다.
import { detectFeatures } from '../src/bin.js';
import { defaultOutDir, start } from '../src/server.js';
import { TOKEN_PATH } from '../src/token.js';

const { features, paths } = detectFeatures();

try {
  const { token, url } = await start();
  const mark = (ok) => (ok ? '✅' : '❌');
  console.log('');
  console.log('  편집ON 내 컴퓨터 도우미가 켜졌습니다.');
  console.log(`  주소: ${url}   (이 컴퓨터에서만 접속됩니다)`);
  console.log('');
  console.log(`  토큰: ${token}`);
  console.log('  웹앱 → 설정 → "내 컴퓨터 도우미"에 위 토큰을 붙여넣으세요.');
  console.log(`  토큰 파일: ${TOKEN_PATH}`);
  console.log('');
  console.log(`  ${mark(features.ytdlp)} 유튜브 받기 (yt-dlp${paths.ytdlp ? '' : ' 없음'})`);
  console.log(`  ${mark(features.ffmpeg)} 네이티브 ffmpeg${paths.ffmpeg ? '' : ' 없음'}`);
  console.log(`  ${mark(features.translate)} 내 컴퓨터 번역 (Ollama${paths.ollama ? '' : ' 없음'})`);
  console.log(`  ${mark(features.tts)} 내 목소리 TTS${features.tts ? '' : ' — EDITON_TTS_COMMAND 를 지정하면 켜집니다'}`);
  console.log('');
  console.log(`  저장 폴더: ${defaultOutDir()}`);
  console.log('  끄려면 Ctrl+C.');
  console.log('');
} catch (e) {
  if (e && e.code === 'EADDRINUSE') {
    console.error('  이미 도우미가 켜져 있습니다 (127.0.0.1:47600).');
    process.exit(0);
  }
  console.error('  도우미를 켜지 못했습니다:', e?.message ?? e);
  process.exit(1);
}
