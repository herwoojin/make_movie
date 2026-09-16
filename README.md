# 편집ON (EditON)

브라우저에서 100% 무료로 돌아가는 초간단 영상 편집 웹앱.
영상 하나를 올리면 **무음·추임새가 잘리고, 자막이 붙고, 얼굴이 가려진** 완성본이 나옵니다. 영상은 서버로 전송되지 않습니다.

## 빠른 시작

```bash
npm install          # postinstall이 ffmpeg·MediaPipe wasm, 얼굴 모델, 폰트를 public/에 복사
npm run dev          # http://localhost:3000  (콘솔에서 self.crossOriginIsolated === true 확인)
```

| 스크립트 | 설명 |
|---|---|
| `npm run typecheck` | TypeScript 검사 |
| `npm run test` / `test:cov` | Vitest 단위 테스트 (EDL·무음 감지·자막·트래커·오디오 이어붙이기·GIF·ZIP·DB) |
| `npm run build` / `start` | 운영 빌드 / 실행 |
| `npm run e2e` | Playwright E2E (`npm run build` 후 실행. 설치된 Google Chrome과 로컬 `ffprobe` 사용) |
| `RUN_NETWORK=1 npm run e2e -- -g Whisper` | 로컬 Whisper 모델을 실제로 내려받아 한국어 단어 타임스탬프 확인 |
| `SHOTS=1 npm run e2e -- tests/e2e/screenshots.spec.ts` | 주요 화면 스크린샷을 `test-results/shots/`에 저장 (눈으로 확인용) |
| `npm run assets` | self-host 자산 다시 복사 |

선택 기능(Google 로그인·프리셋/추임새 사전 동기화)은 Firebase로 붙습니다. `.env.local.example`을 `.env.local`로 복사해 Firebase 웹 앱 설정 값을 넣고, `firestore.rules`를 배포하면 켜집니다 ([docs/GUIDE.md 6.3장](./docs/GUIDE.md)). 값이 없으면 로그인 없이 모든 기능이 그대로 동작합니다.

## 배포 (GitHub → Netlify)
1. `gh auth login` → `git add -A && git commit -m "chore: 첫 커밋"` → `gh repo create editon --private --source=. --push`
2. Netlify에서 GitHub 저장소를 가져오기 (빌드 설정은 `netlify.toml`), 환경변수에 `NEXT_PUBLIC_FIREBASE_*` 입력
3. Firebase 콘솔: Google 로그인 사용 설정, 승인된 도메인에 `xxx.netlify.app` 추가, `npx firebase-tools deploy --only firestore:rules,firestore:indexes,storage`
4. `node scripts/check-deploy.mjs https://xxx.netlify.app` 로 격리 헤더·자산 점검

자세한 순서와 문제 해결: [docs/GUIDE.md 6장·7장](./docs/GUIDE.md)

## 기능
- **자동 컷**: 무음 감지(히스테리시스 -35/-32dB), 추임새 사전(“그·저·뭐” 기본 꺼짐), 제안 목록·미리듣기·개별 토글, 1프레임 경계 조정, Ctrl+Z 20단계
- **자막**: 브라우저 내장 Whisper(WebGPU) 또는 Groq BYOK → 1단계 글자 고치기 / 2단계 시간 맞추기 → 스타일·프리셋 → 번인 또는 SRT/VTT
- **얼굴 모자이크**: MediaPipe 검출 + IoU 추적 + 보간, 인물별 가리기/제외, 수동 사각형, 픽셀·흐림·박스·이모지
- **내보내기**: WebCodecs(하드웨어) 1순위, ffmpeg.wasm 폴백. 유튜브 1080p/720p, 쇼츠 세로, GIF, 오디오만. 진행률·남은 시간·취소
- **도구함**: GIF 일괄 변환, 화면 녹화, 오디오 추출, 이미지 편집, 사진 얼굴 일괄 가리기(ZIP)
- **기타**: 프로젝트 자동 저장·목록·.editon.json 내보내기/불러오기, 저장공간 정리, PWA, 서버·브라우저 용량 신호등

## 구조
```
src/
├─ app/            랜딩 · editor/[projectId] · projects · tools · settings · help · api/server-health
├─ components/     editor(미리보기·타임라인·패널) · tools · landing · settings · ui
├─ lib/            core(edl·undo·timecode) audio stt subtitle vision encode storage editor supabase
├─ workers/        audio · stt · vision · encode · storage · gif
└─ store/          projectStore · timelineStore · uiStore
docs/              PRD · TRD · ERD · PLAN · TASK · GUIDE · PROMPT
```

설계 문서는 [`docs/`](./docs), 기술 스택은 [`TECH_STACK.md`](./TECH_STACK.md), 작업 규칙은 [`AGENTS.md`](./AGENTS.md)에 있습니다.
