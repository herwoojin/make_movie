// COEP 환경에서는 CDN 리소스가 막히므로, 필요한 wasm·모델·폰트를 public/에 self-host 한다.
// npm install 직후(postinstall) 자동 실행된다. 없는 패키지는 건너뛴다(부분 설치 상태에서도 설치가 깨지지 않게).
import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const nm = (p) => join(root, 'node_modules', p);
const pub = (p) => join(root, 'public', p);

function copyDir(from, to, filter = () => true) {
  if (!existsSync(from)) {
    console.warn(`[assets] 건너뜀 (없음): ${from}`);
    return;
  }
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const src = join(from, name);
    if (statSync(src).isDirectory() || !filter(name)) continue;
    cpSync(src, join(to, name));
  }
  console.log(`[assets] ${from} → ${to}`);
}

function copyFile(from, to) {
  if (!existsSync(from)) {
    console.warn(`[assets] 건너뜀 (없음): ${from}`);
    return;
  }
  mkdirSync(join(to, '..'), { recursive: true });
  cpSync(from, to);
  console.log(`[assets] ${from} → ${to}`);
}

// 1) ffmpeg.wasm 코어 — 멀티스레드(core-mt)와 단일스레드(core, cross-origin isolation 실패 시 폴백)
copyDir(nm('@ffmpeg/core-mt/dist/esm'), pub('ffmpeg'));
copyDir(nm('@ffmpeg/core/dist/esm'), pub('ffmpeg-st'));
// @ffmpeg/ffmpeg의 워커는 import(coreURL)을 쓰는데 webpack이 이 동적 import를 가로채 깨뜨린다.
// 번들되지 않은 원본 워커를 self-host 하고 classWorkerURL로 지정해 우회한다.
copyDir(nm('@ffmpeg/ffmpeg/dist/esm'), pub('ffmpeg/lib'), (name) => name.endsWith('.js'));

// 1-2) transformers.js (Whisper) — ONNX 런타임 번들에 import.meta가 있어 Next의 워커 청크 압축기가 깨진다.
//      자체 완결 ESM 빌드와 ORT wasm을 그대로 self-host하고 런타임에 번들 밖에서 import 한다.
for (const name of ['transformers.min.js', 'ort-wasm-simd-threaded.jsep.mjs', 'ort-wasm-simd-threaded.jsep.wasm']) {
  copyFile(nm(`@huggingface/transformers/dist/${name}`), pub(`vendor/transformers/${name}`));
}

// 2) MediaPipe tasks-vision wasm
copyDir(nm('@mediapipe/tasks-vision/wasm'), pub('mediapipe'));

// 3) Pretendard 가변 폰트 (자막 굵기 100~900을 파일 하나로)
copyFile(
  nm('pretendard/dist/web/variable/woff2/PretendardVariable.woff2'),
  pub('fonts/PretendardVariable.woff2'),
);
// ffmpeg(libass) 자막 번인용 — FreeType가 woff2를 못 읽으므로 TTF가 따로 필요하다
copyFile(
  nm('pretendard/dist/public/variable/PretendardVariable.ttf'),
  pub('fonts/PretendardVariable.ttf'),
);

// 4) BlazeFace 모델 — 저장소에 없으면 1회 내려받는다
const modelPath = pub('mediapipe/blaze_face_short_range.tflite');
if (!existsSync(modelPath)) {
  const url = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    mkdirSync(pub('mediapipe'), { recursive: true });
    writeFileSync(modelPath, Buffer.from(await res.arrayBuffer()));
    console.log(`[assets] 모델 다운로드 완료: ${modelPath}`);
  } catch (e) {
    console.warn(`[assets] 얼굴 검출 모델 다운로드 실패 — 수동으로 받아 ${modelPath} 에 두세요. (${e})`);
  }
}
