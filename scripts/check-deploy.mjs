// 배포 후 점검 (GUIDE 6.2장): 격리 헤더가 페이지·정적 파일에 "정확히 한 번" 붙는지, /login 에는 없는지, 자산이 200인지.
// 사용: node scripts/check-deploy.mjs https://your-site.netlify.app
const base = (process.argv[2] ?? '').replace(/\/$/, '');
if (!/^https?:\/\//.test(base)) {
  console.error('사용법: node scripts/check-deploy.mjs https://your-site.netlify.app');
  process.exit(2);
}

const EXPECT = { 'cross-origin-opener-policy': 'same-origin', 'cross-origin-embedder-policy': 'credentialless' };
let failed = 0;

function report(ok, label, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
}

async function check(path, { isolated, method = 'GET' }) {
  let res;
  try {
    res = await fetch(`${base}${path}`, { method, redirect: 'manual' });
  } catch (e) {
    report(false, path, `요청 실패 (${e.message})`);
    return null;
  }
  report(res.status === 200, `${path} 응답`, String(res.status));
  for (const [name, value] of Object.entries(EXPECT)) {
    const got = res.headers.get(name);
    if (isolated) report(got === value, `${path} ${name}`, got === null ? '없음' : got.includes(',') ? `중복됨: ${got}` : got);
    else report(got === null, `${path} ${name} 없어야 함`, got ?? '없음');
  }
  return res;
}

const home = await check('/', { isolated: true });
await check('/editor/deploy-check', { isolated: true });
await check('/tools', { isolated: true });
await check('/settings', { isolated: true });
await check('/login', { isolated: false });
await check('/api/server-health', { isolated: true });

// 페이지가 참조하는 실제 Next 청크 하나
const html = home ? await home.text() : '';
const chunk = html.match(/\/_next\/static\/chunks\/[^"']+\.js/)?.[0];
if (chunk) await check(chunk, { isolated: true, method: 'HEAD' });
else report(false, '/_next/static 청크를 HTML에서 찾지 못함');

for (const asset of [
  '/ffmpeg/ffmpeg-core.wasm',
  '/ffmpeg/ffmpeg-core.worker.js',
  '/ffmpeg/lib/worker.js',
  '/ffmpeg-st/ffmpeg-core.wasm',
  '/mediapipe/blaze_face_short_range.tflite',
  '/mediapipe/vision_wasm_internal.wasm',
  '/vendor/transformers/transformers.min.js',
  '/vendor/transformers/ort-wasm-simd-threaded.jsep.wasm',
  '/fonts/PretendardVariable.woff2',
  '/fonts/PretendardVariable.ttf',
  '/sample/editon-sample.mp4',
  '/sw.js',
]) {
  await check(asset, { isolated: true, method: 'HEAD' });
}

console.log(failed ? `\n❌ ${failed}개 항목 실패` : '\n✅ 모든 항목 통과 — 브라우저 콘솔에서 self.crossOriginIsolated === true 도 확인하세요');
process.exit(failed ? 1 : 0);
