# GUIDE — 편집ON (EditON)

> 개발 환경 세팅 · 실행 · 배포 · 문제 해결 가이드 / v1.0 / 2026-09-13

---

## 1. 사전 준비

| 항목 | 버전 | 확인 |
|---|---|---|
| Node.js | 20 LTS 이상 | `node -v` |
| npm | 10 이상 | `npm -v` |
| Chrome 또는 Edge | 111 이상 | 개발·테스트용 (WebCodecs 필요) |
| Antigravity IDE | 최신 | Claude Opus 5 연결 확인 |
| Firebase 계정 | Spark(무료) | 로그인·동기화용, 초반엔 없어도 됨 |
| GitHub 계정 + `gh` CLI | Free | 코드 저장소·CI |
| Netlify 계정 | Free(Starter) | 배포용 (GitHub 연동) |

---

## 2. 프로젝트 시작

### 2.1 저장소 생성
```bash
npx create-next-app@14 editon --typescript --tailwind --app --src-dir --eslint
cd editon
```
`--turbopack`은 쓰지 않는다. Worker + wasm 조합에서 아직 문제가 잦다.

### 2.2 문서 배치
```bash
mkdir -p docs
# PRD.md TRD.md ERD.md PROMPT.md PLAN.md GUIDE.md TASK.md 를 docs/에 복사
```

### 2.3 Antigravity 규칙 설정
`PROMPT.md`의 **0장 프로젝트 규칙** 전체를 저장소 루트 `AGENTS.md`에 붙여넣는다.
Antigravity 설정에서 이 파일을 항상 컨텍스트에 포함하도록 지정한다.

### 2.4 패키지 설치
```bash
# 상태·저장
npm i zustand immer dexie nanoid

# 미디어
npm i @ffmpeg/ffmpeg@^0.12 @ffmpeg/util@^0.12
npm i mp4box mp4-muxer

# AI
npm i @huggingface/transformers
npm i @mediapipe/tasks-vision

# 로그인·동기화 (선택)
npm i firebase

# 개발
npm i -D vitest @vitest/coverage-v8 happy-dom @playwright/test
```

### 2.5 shadcn/ui
```bash
npx shadcn@latest init
npx shadcn@latest add button slider tabs dialog input label select \
  switch tooltip progress scroll-area separator card badge sonner
```

---

## 3. 필수 설정 — 이걸 먼저 해야 한다

### 3.1 COOP/COEP 헤더
`next.config.js`를 TRD 3.1장 그대로 작성한다. 이게 없으면 ffmpeg.wasm 멀티스레드가 아예 안 돈다.

**설정 후 반드시 확인:**
```js
// 브라우저 콘솔에서
self.crossOriginIsolated   // true 여야 함
```
`false`면 아래 순서로 점검한다.
1. 개발 서버를 완전히 재시작했는가 (`next.config.js` 변경은 hot reload 안 됨)
2. 응답 헤더에 두 헤더가 실제로 붙는가 (DevTools > Network > 문서 > Headers)
3. 페이지에 CDN 이미지·폰트·iframe이 있는가 → 전부 self-host로 바꾼다

### 3.2 정적 자산 배치
```
public/
├── ffmpeg/
│   ├── ffmpeg-core.js
│   ├── ffmpeg-core.wasm
│   └── ffmpeg-core.worker.js       # core-mt용
├── mediapipe/
│   ├── vision_wasm_internal.js
│   ├── vision_wasm_internal.wasm
│   └── blaze_face_short_range.tflite
└── fonts/
    └── Pretendard-*.woff2
```

ffmpeg core 파일 받기:
```bash
mkdir -p public/ffmpeg
npm i -D @ffmpeg/core-mt@^0.12
cp node_modules/@ffmpeg/core-mt/dist/umd/* public/ffmpeg/
```

MediaPipe 파일은 `@mediapipe/tasks-vision`의 `wasm` 디렉터리에서, tflite 모델은 Google 공식 모델 페이지에서 받아 배치한다.

### 3.3 폰트 self-host
```tsx
// src/app/fonts.ts
import localFont from 'next/font/local';

export const pretendard = localFont({
  src: [
    { path: '../../public/fonts/Pretendard-Regular.woff2', weight: '400' },
    { path: '../../public/fonts/Pretendard-Bold.woff2',    weight: '700' },
  ],
  variable: '--font-pretendard',
  display: 'swap',
});
```
자막 렌더에서도 같은 폰트를 쓰려면 Canvas에서 폰트 로드를 기다려야 한다.
```ts
await document.fonts.ready;   // 이걸 안 하면 첫 렌더에서 폰트가 폴백으로 나온다
```

### 3.4 Worker 설정
Next.js 14에서 Worker는 이렇게 만든다.
```ts
const worker = new Worker(
  new URL('../workers/audio.worker.ts', import.meta.url),
  { type: 'module' }
);
```
경로를 변수로 만들면 번들러가 못 찾는다. `new URL(...)`을 인라인으로 써야 한다.

### 3.5 스크립트
`package.json`:
```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:cov": "vitest run --coverage",
    "e2e": "playwright test"
  }
}
```

---

## 4. 개발 워크플로

```
1. docs/TASK.md에서 다음 태스크 하나를 고른다
2. docs/PROMPT.md에서 해당 장의 프롬프트를 복사한다
3. Antigravity에 붙여넣고 실행시킨다
4. npm run typecheck && npm run test 통과 확인
5. 브라우저에서 직접 눌러 본다 (이게 제일 중요)
6. TASK.md 체크박스 갱신
7. 커밋: feat(auto-cut): 무음 감지 알고리즘 구현 (T-016)
```

**한 태스크가 끝나기 전에 다음 태스크를 시작하지 않는다.** 두 개를 동시에 물리면 오류가 났을 때 어느 쪽 문제인지 알 수 없다.

### 커밋 컨벤션
```
feat(scope):     새 기능
fix(scope):      버그 수정
perf(scope):     성능 개선
refactor(scope): 동작 변화 없는 구조 변경
test(scope):     테스트
docs:            문서
chore:           설정·의존성
```
scope 예: `import`, `timeline`, `auto-cut`, `subtitle`, `mosaic`, `export`, `storage`

---

## 5. 테스트

### 단위 테스트
```bash
npm run test
npm run test:cov
```
`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    coverage: {
      include: ['src/lib/core/**', 'src/lib/audio/**', 'src/lib/subtitle/**', 'src/lib/vision/tracker.ts'],
      thresholds: { lines: 90, functions: 90, branches: 80 },
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
```

### 테스트 픽스처 만들기
로컬에 ffmpeg가 있다면(브라우저용 wasm 말고 CLI) 이렇게 만든다.
```bash
# 5초, 무음 2구간이 명확한 테스트 영상
ffmpeg -f lavfi -i testsrc=size=640x360:rate=30:duration=5 \
       -f lavfi -i "sine=frequency=440:duration=5" \
       -af "volume=enable='between(t,1,2)+between(t,3.5,4.5)':volume=0" \
       -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest \
       tests/fixtures/silence-test.mp4
```
이 파일은 저장소에 커밋한다(수백 KB).

### E2E
```bash
npx playwright install chromium
npm run e2e
```
Playwright는 헤드리스에서 WebCodecs 하드웨어 가속이 안 될 수 있다. 실행 인자에 `--use-gl=angle --enable-features=SharedArrayBuffer`를 넣거나, E2E는 ffmpeg 폴백 경로로 검증한다.

---

## 6. 배포 (GitHub → Netlify) · 로그인/DB (Firebase)

### 6.1 GitHub에 올리기
```bash
gh auth login                                   # 처음 한 번 (브라우저로 GitHub 로그인)
git add -A && git commit -m "chore: 편집ON 첫 커밋"
gh repo create editon --private --source=. --push
```
- `.gitignore`가 `node_modules`, `.next`, 설치 때 복사되는 wasm(`public/ffmpeg*`, `public/vendor`, `public/fonts`), `.env*.local`, `.firebaserc`를 제외한다. 얼굴 모델(`public/mediapipe/blaze_face_short_range.tflite`)·샘플 영상·테스트 픽스처는 커밋된다.
- `main`에 push하면 GitHub Actions(`.github/workflows/ci.yml`)가 타입·린트·단위 테스트·빌드를 돌린다. E2E는 Actions 탭 > CI > Run workflow로 수동 실행.

### 6.2 Netlify 연결
1. Netlify > Add new site > Import an existing project > GitHub > 저장소 선택
2. 빌드 설정은 `netlify.toml`을 따른다 (`npm run assets && npm run build`, Node 22). Next.js 런타임은 자동 적용
3. Site configuration > Environment variables 에 6.3의 `NEXT_PUBLIC_FIREBASE_*` 값을 넣고 Deploys > Trigger deploy (환경변수는 빌드 때 번들에 들어가므로 바꾸면 다시 배포해야 한다)
4. 헤더 구조: 페이지 응답은 `next.config.js`, CDN이 직접 내주는 정적 파일(`/_next/static`, `/ffmpeg*`, `/mediapipe`, `/vendor`, `/fonts`, `/sample`, `/sw.js`)은 `netlify.toml`이 격리 헤더를 붙인다. **`/login`만 격리 헤더가 없다** (Firebase 팝업 로그인 때문)

### 6.3 Firebase 준비
1. https://console.firebase.google.com 에서 프로젝트 만들기 (Google 애널리틱스는 끈다 — 3자 분석 스크립트 미사용 원칙)
2. 프로젝트 설정 > 일반 > 내 앱 > 웹 앱(</>) 추가 → `firebaseConfig` 값을 `.env.local`(로컬, `.env.local.example` 복사)과 Netlify 환경변수에 입력
3. Authentication > 시작하기 > 로그인 방법 > **Google 사용 설정**
4. Authentication > 설정 > **승인된 도메인**에 `xxx.netlify.app`과 연결한 커스텀 도메인 추가 (`localhost`는 기본 포함)
5. Firestore Database > 데이터베이스 만들기 (위치 `asia-northeast3`(서울) 권장, 프로덕션 모드)
6. 규칙·인덱스 배포:
```bash
cp .firebaserc.example .firebaserc              # 프로젝트 id 입력
npx firebase-tools login
npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage
```
- 웹 설정 값은 공개 식별자라 번들에 들어가도 된다. 보호는 `firestore.rules`가 한다 — **규칙을 배포하지 않으면 동기화가 permission-denied로 실패한다**
- 요금: Spark(무료)로 충분하다. 영상은 올리지 않으므로 문서 수·용량이 매우 작다. Storage는 쓰지 않는다(`storage.rules` 전부 거부)

### 6.4 배포 후 체크리스트
- [ ] `node scripts/check-deploy.mjs https://xxx.netlify.app` 전 항목 ✅ (격리 헤더 1회씩, `/login`은 없음, wasm·모델 200)
- [ ] 브라우저 콘솔에서 `self.crossOriginIsolated === true` (랜딩 진단 5개 모두 ✅)
- [ ] 폰트가 CDN이 아니라 자기 도메인에서 옴
- [ ] 5초 테스트 영상으로 임포트 → 컷 → 내보내기 성공
- [ ] 오른쪽 위 로그인 → Google 계정 선택 → 설정 > 자막 프리셋 동기화 성공 → 다른 브라우저에서 로그인해 프리셋이 보임
- [ ] Lighthouse Performance 80+, Accessibility 95+

### 6.5 로컬 에뮬레이터 (선택, Java 17+ 필요)
```bash
npx firebase-tools emulators:start              # Auth 9099 · Firestore 8080 · UI 4000
# .env.local: NEXT_PUBLIC_FIREBASE_USE_EMULATOR=1, PROJECT_ID=demo-editon 등 임의 값
```

---

## 7. 문제 해결

### `SharedArrayBuffer is not defined`
cross-origin isolation이 안 걸린 것. 3.1장으로 돌아간다. 배포 환경에서만 나면 Vercel 헤더 설정이 안 먹은 것이니 응답 헤더를 직접 확인한다.

### COEP 때문에 이미지·폰트가 안 뜬다
외부 도메인 리소스가 차단된 것.
- 해결 1: 전부 self-host (권장)
- 해결 2: COEP를 `credentialless`로 (Chrome 96+, Safari 미지원)
- 해결 3: 해당 리소스에 `crossorigin="anonymous"` 추가 (서버가 CORP 헤더를 주는 경우만)

### ffmpeg.wasm이 브라우저를 멈춘다
메인 스레드에서 실행한 것. 반드시 Worker 안에서 돌린다. `@ffmpeg/ffmpeg` 0.12는 내부적으로 Worker를 쓰지만, 파일 read/write는 여전히 호출 스레드를 막는다.

### 몇 초 만에 메모리가 폭발한다
`VideoFrame` / `AudioData` / `ImageBitmap`을 `close()` 하지 않은 것. 이 세 객체는 GC가 회수하지 못한다.
```ts
const frame = await decoder.decode(chunk);
try {
  ctx.drawImage(frame, 0, 0);
} finally {
  frame.close();      // 이거 없으면 확실히 터진다
}
```

### 내보낸 영상의 소리가 안 맞는다
컷 구간 이어붙이기에서 오디오 샘플 수와 비디오 프레임 수를 각각 계산하다 어긋난 것. **오디오 타임스탬프를 기준으로 삼고**, 비디오 프레임을 거기에 맞춘다. 컷 경계에는 5ms 크로스페이드를 넣는다.

### 자막 미리보기와 실제 결과가 다르다
렌더 함수가 두 개인 것. `renderSubtitleToCanvas(ctx, cue, style, videoWidth)` 하나만 두고 미리보기·내보내기가 같이 쓰게 한다. 폰트 크기는 반드시 `videoWidth` 기준 비율로 계산한다.

### Whisper 모델 다운로드가 매번 다시 된다
`transformers.js`가 Cache Storage를 못 쓰는 상황. HTTPS인지, 시크릿 모드가 아닌지 확인한다. `env.useBrowserCache = true` 설정도 확인한다.

### 얼굴 검출이 자꾸 끊긴다
- 샘플링 간격이 너무 넓다 → 5프레임에서 3프레임으로 줄인다
- IoU 임계값이 너무 높다 → 0.3에서 0.2로 낮춘다
- 빠르게 움직이는 영상이면 트랙 종료 기준을 3프레임에서 8프레임으로 늘린다

### OPFS에 저장이 안 된다
```ts
const est = await navigator.storage.estimate();
console.log(est.usage, est.quota);
// 영구 저장 요청
const persisted = await navigator.storage.persist();
```
브라우저 저장공간이 부족하거나, 시크릿 모드이거나, iOS Safari다.

### Dexie 스키마를 바꿨더니 오류가 난다
버전을 올려야 한다.
```ts
this.version(2).stores({ /* 바뀐 스키마 */ }).upgrade(async tx => {
  await tx.table('projects').toCollection().modify(p => { p.schemaVersion = 2; });
});
```
개발 중이면 그냥 DevTools > Application > IndexedDB에서 `editon` DB를 삭제하는 게 빠르다.

---

### Google 로그인 창이 안 뜨거나, 로그인 후 멈춘다
- 로그인은 `/login` 페이지에서만 된다. 이 페이지 응답에 `Cross-Origin-Opener-Policy`가 붙어 있으면 팝업과 통신이 끊긴다 → `node scripts/check-deploy.mjs <주소>`로 확인
- `auth/unauthorized-domain`: Firebase 콘솔 > Authentication > 설정 > 승인된 도메인에 사이트 주소 추가
- `auth/popup-blocked`: 주소창의 팝업 차단 아이콘에서 허용
- 동기화가 `permission-denied`: `firestore.rules`를 배포하지 않은 것 (6.3의 6번)
- 앱 ↔ 로그인 페이지 이동은 전체 새로고침 링크(`<a>`)여야 한다. Next `<Link>`로 로그인 페이지에 가면 격리된 문서가 이어져 팝업이 막히고, 로그인 페이지에서 `<Link>`로 돌아오면 고속 처리 모드가 꺼진다

## 8. 사용자용 간단 사용법 (앱 도움말에 넣을 내용)

### 영상 자르기
1. 영상 파일을 화면에 끌어다 놓습니다.
2. 왼쪽 **자동 컷** 을 누릅니다.
3. **무음 찾기** 를 누르면 말이 없는 구간이 빨갛게 표시됩니다.
4. 너무 많이 잡히면 "민감도"를 낮추고, 덜 잡히면 높입니다.
5. 목록에서 지울 구간을 확인하고 **적용** 을 누릅니다.
6. 마음에 안 들면 Ctrl+Z로 되돌립니다.

### 자막 넣기
1. 왼쪽 **자막** → **자막 만들기** 를 누릅니다.
2. 처음 한 번은 음성 인식 파일을 내려받습니다(약 150MB, 다음부터는 안 받습니다).
3. **1단계** 에서 잘못 적힌 글자를 고칩니다.
4. **2단계** 에서 자막이 나오는 시간을 맞춥니다.
5. **꾸미기** 에서 글꼴·크기·색을 고릅니다.
6. 마음에 드는 설정은 **프리셋으로 저장** 해두면 다음 영상에서 바로 씁니다.

### 얼굴 가리기
1. 왼쪽 **모자이크** → **얼굴 찾기** 를 누릅니다.
2. 찾은 사람들이 목록에 나옵니다.
3. 본인은 **가리지 않기** 로 끄고, 나머지는 켜둡니다.
4. 못 찾은 얼굴은 미리보기 위에 직접 네모를 그려 추가합니다.

### 내보내기
1. 오른쪽 위 **내보내기** 를 누릅니다.
2. 유튜브용 / 쇼츠용 / GIF 중에서 고릅니다.
3. 시간이 오래 걸릴 수 있습니다. 창을 닫지 마세요(다른 탭은 봐도 됩니다).

### 알아두실 점
- 영상은 인터넷으로 전송되지 않고 이 컴퓨터 안에서만 처리됩니다.
- 크롬 또는 엣지 브라우저를 권장합니다.
- 20분이 넘는 영상은 느려질 수 있습니다.
- 브라우저 데이터를 지우면 작업 중이던 프로젝트도 지워집니다. 중요하면 프로젝트 파일을 내보내 두세요.

---

## 9. 유용한 참고 링크

| 주제 | 링크 |
|---|---|
| WebCodecs | https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API |
| cross-origin isolation | https://web.dev/articles/coop-coep |
| OPFS | https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system |
| ffmpeg.wasm | https://ffmpegwasm.netlify.app/ |
| transformers.js | https://huggingface.co/docs/transformers.js |
| MediaPipe Face Detector | https://ai.google.dev/edge/mediapipe/solutions/vision/face_detector |
| Dexie | https://dexie.org/docs/ |
| ASS 자막 포맷 | http://www.tcax.org/docs/ass-specs.htm |
