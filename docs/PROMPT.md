# PROMPT — 편집ON (EditON)

> Antigravity IDE + Claude Opus 5 실행용 프롬프트 모음 / v1.0
> 사용법: ① 아래 **0장**을 프로젝트 규칙 파일에 한 번 넣는다 → ② **1~7장**을 필요할 때 하나씩 복사해서 붙인다.
> **한 번에 태스크 하나만** 시킨다. 여러 개를 몰아서 시키면 컨텍스트가 무너지고 되돌리기 어려워진다.

---

## 0. 프로젝트 규칙 (최초 1회 — `AGENTS.md` 또는 `.antigravity/rules.md`에 저장)

```markdown
# 편집ON 프로젝트 규칙

당신은 이 저장소의 시니어 프론트엔드 엔지니어입니다.
브라우저에서 100% 클라이언트 사이드로 동작하는 무료 영상 편집 웹앱 "편집ON"을 만듭니다.

## 절대 규칙
1. 영상 파일을 서버로 전송하는 코드를 절대 작성하지 않는다. 모든 미디어 처리는 브라우저 안에서 끝난다.
2. 100ms 이상 걸릴 수 있는 연산은 반드시 Web Worker로 보낸다. 메인 스레드를 블로킹하지 않는다.
3. 원본 미디어 파일은 절대 수정하지 않는다. 편집은 EDL(EdlSegment[]) 데이터로만 표현한다.
4. 시간 값은 전부 밀리초 정수(number)로 다룬다. 초 단위 float를 저장하지 않는다.
5. 모자이크 좌표는 0~1 정규화 값으로 저장한다.
6. 새 npm 패키지를 추가하기 전에 먼저 제안하고 승인을 받는다.
7. 요청하지 않은 파일을 수정하지 않는다. 리팩터링을 임의로 하지 않는다.

## 기술 스택 (변경 금지)
Next.js 14 App Router / TypeScript strict / Tailwind CSS / shadcn-ui /
Zustand + immer / Dexie 4 / WebCodecs (1순위) + @ffmpeg/ffmpeg 0.12 (폴백) /
@huggingface/transformers (Whisper) / @mediapipe/tasks-vision / Firebase Auth + Firestore (로그인·프리셋·사전 동기화만)
배포: GitHub → Netlify (netlify.toml) / CI: GitHub Actions

## 코드 규칙
- `any` 금지. 불가피하면 `unknown` + 타입가드.
- 순수 로직(`lib/core`, `lib/audio`, `lib/subtitle`, `lib/vision/tracker`)은 DOM·React에 의존하지 않는 순수 함수로 작성하고, 같은 커밋에 Vitest 테스트를 함께 작성한다.
- React 컴포넌트는 200줄을 넘기지 않는다. 넘으면 분리한다.
- 사용자에게 보이는 모든 문자열은 한국어 평문으로 쓴다. 기술 용어는 괄호로 풀어 쓴다.
  예: "무음 임계값 (조용하다고 판단할 소리 크기)"
- 에러는 반드시 `AppError { code, message, hint }` 형태로 던지고, hint에는 사용자가 다음에 할 행동을 쓴다.
- 모든 Worker 통신은 `{ id, type, payload }` / `{ id, status, ... }` 규약을 따른다.
- 주석은 "무엇을"이 아니라 "왜"를 쓴다.

## 작업 방식
- 작업 시작 전에 무엇을 바꿀지 파일 목록과 함께 3줄로 먼저 말한다.
- 코드를 다 쓴 뒤에는 반드시 `npm run typecheck && npm run test`를 실행해서 통과를 확인한다.
- 확신이 없으면 추측해서 만들지 말고 질문한다.
- 한 응답에서 파일 5개 이상을 새로 만들지 않는다.

## 참고 문서
설계 근거는 `docs/PRD.md`, `docs/TRD.md`, `docs/ERD.md`에 있다.
작업 목록은 `docs/TASK.md`에 있고, 완료 시 체크박스를 갱신한다.
```

---

## 1. 프로젝트 초기 세팅

```
docs/TRD.md와 docs/ERD.md를 읽고 프로젝트 뼈대를 만들어 주세요.

작업 범위 (T-001 ~ T-004):
1. Next.js 14 App Router + TypeScript strict + Tailwind + shadcn/ui 초기화
2. next.config.js에 COOP/COEP 헤더 설정 (TRD 3.1장 그대로)
3. TRD 5장의 디렉터리 구조를 빈 파일 없이 실제 필요한 것만 생성
4. src/lib/env/capabilities.ts 작성 — crossOriginIsolated, SharedArrayBuffer,
   WebCodecs, WebGPU, OPFS 지원 여부를 감지하는 함수와, 미지원 시 표시할
   한국어 안내 문구 매핑
5. 랜딩 페이지(/)에 지원 여부 진단 결과를 보여주는 임시 화면

완료 조건:
- npm run dev로 띄운 뒤 브라우저 콘솔에서 self.crossOriginIsolated === true
- 진단 화면에 5개 항목의 지원 여부가 ✅/❌로 표시됨

주의:
- 폰트는 next/font/local로 self-host. Google Fonts CDN을 쓰지 마세요 (COEP에 막힙니다).
- 아직 미디어 처리 코드는 작성하지 마세요.
```

---

## 2. 저장 계층 (OPFS + Dexie)

```
docs/ERD.md 3장과 4장을 그대로 구현해 주세요.

작업 범위 (T-005 ~ T-008):
1. src/lib/storage/db.ts — ERD 3장의 Dexie 스키마와 타입 전체
2. src/lib/storage/opfs.ts — 다음 함수들
   - ensureDir(path): 중첩 디렉터리 생성
   - writeFile(path, stream|blob, onProgress): 큰 파일 스트리밍 쓰기
   - readFile(path): File 반환
   - deleteDir(path): 재귀 삭제
   - listOrphans(): IndexedDB에 없는 OPFS 디렉터리 목록
3. src/workers/storage.worker.ts — createSyncAccessHandle을 쓰는 대용량 쓰기
   (메인 스레드에서는 SyncAccessHandle을 못 씁니다)
4. src/lib/storage/quota.ts — navigator.storage.estimate() 래퍼,
   "원본 크기의 3배 여유가 있는지" 판단 함수

완료 조건:
- Vitest로 db 스키마 생성/조회/삭제 테스트 통과
- 수동 확인: 500MB 파일을 OPFS에 쓰고 다시 읽어서 크기가 같음
- 진행률 콜백이 실제로 여러 번 호출됨

주의: 저장 실패 시 QUOTA_EXCEEDED를 던지고, hint에 "설정 > 저장공간 정리에서
      오래된 프로젝트를 지워보세요"를 넣어 주세요.
```

---

## 3. 미디어 임포트와 타임라인

```
파일 임포트부터 타임라인 표시까지 만들어 주세요.

작업 범위 (T-009 ~ T-015):
1. src/lib/audio/decode.ts — 파일에서 오디오를 Float32Array PCM으로 디코드
   (OfflineAudioContext 사용, 모노 16kHz로 리샘플 — STT와 무음분석 둘 다 이걸로 씁니다)
2. src/lib/audio/peaks.ts — PCM → 초당 100포인트 min/max 피크 (Int8Array)
3. src/workers/audio.worker.ts — 위 둘을 Worker에서 실행, 진행률 보고
4. src/lib/media/probe.ts — WebCodecs로 해상도/fps/코덱/길이 추출
5. src/components/editor/Timeline/WaveformTrack.tsx — Canvas로 피크 렌더,
   줌 레벨에 따라 다운샘플, 60fps 유지
6. src/components/editor/Timeline/TimelineRoot.tsx — 눈금자, 재생헤드,
   드래그 스크럽, 마우스휠 줌(Ctrl+휠), 스페이스바 재생/정지
7. src/store/timelineStore.ts — Zustand, 현재 시간·줌·선택 상태

완료 조건:
- 20분짜리 mp4를 드롭하면 15초 안에 파형과 타임라인이 뜬다
- 타임라인을 드래그하면 미리보기 영상이 따라온다
- 파형 스크롤/줌이 끊기지 않는다

주의:
- 파형은 React 리렌더로 그리지 마세요. Canvas에 직접 그리고 requestAnimationFrame으로 갱신.
- 20분 오디오 PCM은 메모리에 다 올리면 큽니다. 피크 계산 후 PCM은 OPFS로 내보내고 해제하세요.
```

---

## 4. 무음 자동 컷 편집 (핵심 기능)

```
docs/TRD.md 4.2장의 무음 감지 알고리즘을 구현해 주세요.
이 기능이 이 앱의 핵심이라 정확도가 가장 중요합니다.

작업 범위 (T-016 ~ T-021):
1. src/lib/audio/silence.ts
   - detectSilence(pcm: Float32Array, sampleRate: number, params: SilenceParams): CutSuggestion[]
   - TRD 4.2장 알고리즘 7단계를 그대로 구현
   - 히스테리시스(진입 -35dB / 이탈 -32dB)를 반드시 넣어 주세요.
     안 넣으면 경계에서 컷이 잘게 쪼개집니다.
   - 순수 함수. DOM 의존 금지.
2. 같은 커밋에 Vitest 테스트:
   - 완전 무음 → 전체가 하나의 제안
   - 무음 없음 → 빈 배열
   - minSilenceMs보다 짧은 무음 → 무시됨
   - padding 적용 후 구간이 음수 길이가 되면 제안에서 제외
   - minKeepMs 미만 유지구간 병합 동작
3. src/lib/core/edl.ts
   - applySuggestions(edl, accepted): EdlSegment[]  — 제안을 EDL에 반영
   - sourceToOutput / outputToSource (ERD 6.3장 코드 참고)
   - splitAt(edl, sourceMs), toggleSegment(edl, id)
   - 전부 순수 함수 + 테스트 커버리지 90% 이상
4. src/components/editor/panels/AutoCutPanel.tsx
   - 슬라이더 4개(임계 dB / 최소 무음 길이 / 앞뒤 여백 / 최소 유지 길이)
   - 슬라이더를 움직이면 300ms 디바운스 후 재계산 (파형 위에 즉시 미리보기)
   - 제안 목록: 각 항목에 [시작–끝 / 길이 / 미리듣기 ▶ / 살리기·자르기 토글]
   - "선택한 N개 적용" 버튼
   - "전체 되돌리기" 버튼
5. 파형 트랙 위에 제안 구간을 반투명 빨간 오버레이로 표시

완료 조건:
- 실제 말하는 영상에서 "말 없는 구간"이 눈으로 봐도 맞게 잡힌다
- 슬라이더 조작 시 UI가 멈추지 않는다
- 적용 후 Ctrl+Z로 완전히 되돌아간다

주의: 적용 즉시 파일을 자르지 마세요. EDL만 바꿉니다. 실제 렌더는 내보내기 때 한 번.
```

---

## 5. 자막 (STT → 2단계 편집 → 스타일)

```
자막 기능을 만들어 주세요. 태스크가 크니 5-1, 5-2, 5-3으로 나눠서 하나씩 요청하겠습니다.
지금은 5-1만 해주세요.

## 5-1. STT 어댑터
작업 범위 (T-022 ~ T-026):
1. src/lib/stt/types.ts — TRD 4.4장의 SttAdapter, SttResult 인터페이스
2. src/lib/stt/localWhisper.ts
   - @huggingface/transformers 사용, onnx-community/whisper-base 모델
   - WebGPU 우선, 없으면 wasm
   - return_timestamps: 'word' 로 단어 단위 타임스탬프 획득
   - 최초 모델 다운로드 진행률을 콜백으로 보고 (사용자가 150MB 받는 걸 알아야 함)
   - 30초 청크로 나눠 처리하고 청크별 진행률 보고
3. src/lib/stt/groq.ts — BYOK, whisper-large-v3-turbo, 25MB 초과 시 분할 업로드
4. src/workers/stt.worker.ts
5. src/lib/stt/fillers.ts
   - 기본 한국어 필러 사전 (TRD 4.3장)
   - '그', '저', '뭐'는 기본 비활성 (의미 있는 단어로도 쓰임)
   - matchFillers(words, dictionary): CutSuggestion[]
   - 정규화: 공백·문장부호 제거 후 비교
   - 테스트: '음' 매칭됨 / '음악'은 매칭 안 됨 / 연속 필러는 하나로 병합

완료 조건:
- 1분짜리 한국어 영상에서 단어 단위 타임스탬프가 나온다
- 모델 다운로드 진행률이 UI에 표시된다
- BYOK 키가 없으면 groq 어댑터가 isAvailable()에서 false를 반환한다

주의: BYOK 사용 시 "오디오가 Groq 서버로 전송됩니다"를 사용 직전에 모달로 고지하는
      플래그를 어댑터 메타데이터에 넣어 주세요.
```

```
## 5-2. 자막 2단계 편집 UI
작업 범위 (T-027 ~ T-031):
1. src/lib/subtitle/model.ts — 단어 배열을 문장 단위 Cue로 묶기
   - 문장부호 / 0.7초 이상 간격 / maxCharsPerLine 기준으로 분할
2. SubtitlePanel.tsx — 탭 2개
   - [1단계: 글자 고치기] 문장 목록, 인라인 편집, 합치기/나누기, 일괄 찾아바꾸기
   - [2단계: 시간 맞추기] 각 큐의 시작/끝을 타임라인에서 드래그, ±0.1초 버튼,
     "현재 재생 위치로 맞추기" 버튼
3. SubtitleTrack.tsx — 타임라인에 큐 블록 표시, 드래그로 이동/리사이즈,
   겹침 발생 시 빨간 테두리로 경고
4. 편집 중인 큐를 미리보기 캔버스에 실시간 반영
5. EDL 변경 시 자막 시간 재매핑 (ERD 6.3장 sourceToOutput 사용).
   잘려나간 구간의 자막은 삭제하지 말고 '고아' 표시 후 사용자에게 처리 선택권을 주세요.

완료 조건:
- 문장을 고치면 미리보기에 바로 보인다
- 컷 편집을 추가로 해도 자막이 어긋나지 않는다
```

```
## 5-3. 자막 스타일과 내보내기
작업 범위 (T-032 ~ T-036):
1. StylePanel — ERD의 SubtitleStyle 전 필드를 조절하는 UI
   (글꼴, 크기, 굵기, 색, 외곽선, 그림자, 배경박스, 위치, 정렬, 줄바꿈, 최대 줄 수)
2. 실시간 미리보기 (Canvas 렌더, 실제 내보내기와 동일한 렌더 함수 공유 — 중요)
3. 프리셋 저장/불러오기 (로컬 IndexedDB, 로그인 시 Supabase 동기화)
   기본 프리셋 4종: 유튜브 기본 / 굵은 예능자막 / 미니멀 / 밝은 배경용
4. src/lib/subtitle/ass.ts — ASS 파일 생성 (ffmpeg 번인용)
5. src/lib/subtitle/srt.ts — SRT/VTT 내보내기·불러오기

완료 조건:
- 미리보기와 실제 내보낸 영상의 자막이 픽셀 단위로 거의 같다
- SRT로 내보낸 파일이 VLC에서 정상 재생된다

주의: 미리보기용 렌더와 내보내기용 렌더가 다른 코드면 반드시 어긋납니다.
      renderSubtitleToCanvas(ctx, cue, style, videoWidth) 한 함수만 쓰세요.
```

---

## 6. 얼굴 자동 모자이크

```
docs/TRD.md 4.5장의 얼굴 검출·추적·모자이크를 구현해 주세요.

작업 범위 (T-037 ~ T-043):
1. src/lib/vision/faceDetect.ts — @mediapipe/tasks-vision FaceDetector 래퍼
   - wasm과 blaze_face_short_range.tflite는 /public/mediapipe/에 self-host
   - runningMode: 'VIDEO'
2. src/lib/vision/tracker.ts — IoU 기반 그리디 트래킹 (순수 함수 + 테스트)
   - IoU > 0.3이면 같은 트랙
   - 3프레임 연속 미검출 시 트랙 종료
   - 트랙 종료 후 같은 위치에 다시 나타나면 새 ID (오탐 병합보다 분리가 안전)
3. 5프레임 간격 샘플링 + 사이 프레임 선형 보간
4. src/workers/vision.worker.ts — 전체 영상 스캔, 진행률 보고, 취소 가능
5. src/lib/vision/mosaicRender.ts — pixelate / blur / box / emoji 4종
   - 미리보기와 내보내기가 같은 함수를 쓸 것
6. MosaicPanel.tsx
   - 검출된 인물 목록 (각 인물의 대표 썸네일 + 등장 구간 + 켜기/끄기 토글)
   - 모드·강도·영역 배율·모양 조절
   - "이 사람은 가리지 않기" (본인 제외용)
   - 수동 사각형 추가 (미리보기 위에 드래그)
7. 사진 일괄 모자이크: /tools에서 이미지 여러 장 드롭 → 자동 처리 → ZIP 다운로드

완료 조건:
- 5분 영상에서 얼굴 추적이 끊기지 않는다
- 인물별 on/off가 즉시 미리보기에 반영된다
- 검출 실패 구간에 수동 박스를 추가하면 그 구간만 가려진다

참고: 살핌ON에서 만든 MediaPipe FaceDetector 래퍼와 모자이크 렌더 로직이 있으면
      그대로 가져와서 쓰고, 프레임 간 트래킹과 인물별 예외 처리만 새로 만드세요.
```

---

## 7. 내보내기 (인코더)

```
내보내기를 만들어 주세요. 7-1(WebCodecs)을 먼저 하고, 성공한 뒤 7-2(ffmpeg 폴백)를 합니다.

## 7-1. WebCodecs 인코더
작업 범위 (T-044 ~ T-049):
1. src/lib/encode/types.ts — TRD 4.6장의 EncoderAdapter, RenderJob
2. src/lib/encode/webcodecs/demux.ts — mp4box.js로 샘플 추출
3. src/lib/encode/webcodecs/render.ts
   - VideoDecoder → VideoFrame → OffscreenCanvas
   - 모자이크 오버레이 → 자막 오버레이 순서로 합성
   - VideoEncoder로 재인코딩
   - EDL의 유지 구간만 처리하고 타임스탬프를 연속으로 재계산
4. 오디오: AudioDecoder → 구간 이어붙이기 → AudioEncoder
   - 컷 경계에 5ms 크로스페이드를 넣어 '뚝' 끊기는 소리를 없앨 것
5. mp4-muxer로 먹싱 → Blob → OPFS 저장 → 다운로드
6. ExportPanel.tsx — 프리셋(유튜브 1080p/720p, 쇼츠 세로, GIF, 오디오만),
   진행률 바 + 남은 시간 + 취소 버튼

완료 조건:
- 컷·자막·모자이크가 모두 반영된 mp4가 나온다
- 영상과 소리의 싱크가 맞는다 (10분 영상에서 오차 100ms 이내)
- 취소 버튼이 실제로 즉시 멈춘다

주의:
- VideoFrame은 반드시 close() 하세요. 안 하면 몇 초 만에 메모리가 터집니다.
- encodeQueueSize가 30을 넘으면 backpressure 대기를 넣으세요.
```

```
## 7-2. ffmpeg.wasm 폴백
작업 범위 (T-050 ~ T-053):
1. @ffmpeg/ffmpeg 0.12 + core-mt, wasm은 /public/ffmpeg/에 self-host
2. TRD 4.6장의 select/aselect 필터 방식으로 컷 적용
3. 자막은 ASS 파일을 FS에 쓰고 subtitles 필터로 번인
4. 모자이크는 필터 체인 대신 Canvas로 미리 구운 프레임을 이미지 시퀀스로 전달
5. -preset ultrafast 고정, 진행률은 ffmpeg 로그의 time= 파싱

완료 조건:
- WebCodecs를 강제로 끈 상태에서도 결과물이 나온다
- 예상 시간이 10분을 넘으면 "시간이 오래 걸립니다" 경고를 먼저 띄운다
```

---

## 8. 자주 쓰는 보조 프롬프트

### 버그 수정
```
증상: (무엇이 어떻게 잘못되는지)
재현: (1) ... (2) ... (3) ...
기대: ...
실제: ...
콘솔 로그:
```
```

원인을 먼저 3줄로 진단하고, 고칠 파일을 알려준 다음 수정해 주세요.
증상만 덮는 수정 말고 원인을 고쳐 주세요.
같은 버그를 잡는 회귀 테스트를 함께 추가해 주세요.
```

### 성능 개선
```
(작업 이름)이 (측정값)초 걸립니다. TRD 6장 목표는 (목표값)초입니다.

1. 먼저 어디서 시간이 쓰이는지 계측 코드를 넣고 실제 수치를 뽑아 주세요.
2. 추측으로 최적화하지 말고, 계측 결과 상위 2개만 개선해 주세요.
3. 개선 전후 수치를 비교해서 보고해 주세요.
```

### 코드 리뷰
```
방금 작성한 코드를 다음 기준으로 스스로 점검하고, 문제가 있으면 고쳐 주세요.
1. 메인 스레드를 100ms 이상 블로킹하는 부분이 있는가
2. VideoFrame / AudioData / ImageBitmap을 close() 하지 않은 곳이 있는가
3. Worker에 큰 배열을 transfer 없이 복사해서 넘기는 곳이 있는가
4. 시간 값을 초 단위 float로 다루는 곳이 있는가
5. 사용자에게 보이는 에러 메시지에 hint(다음에 할 행동)가 빠진 곳이 있는가
6. any 타입이 있는가
7. 순수 함수인데 테스트가 없는 곳이 있는가
```

### 태스크 완료 처리
```
방금 작업한 내용으로 docs/TASK.md의 해당 항목 체크박스를 갱신하고,
막힌 부분이나 다음 작업에 영향을 주는 결정사항이 있으면
docs/TASK.md 맨 아래 "결정 기록"에 한 줄로 추가해 주세요.
```

---

## 9. 프롬프트 작성 요령 (Opus 5 기준)

| 하면 좋은 것 | 이유 |
|---|---|
| 태스크 번호로 범위를 못 박기 (`T-016 ~ T-021`) | 작업이 옆으로 번지는 걸 막는다 |
| "완료 조건"을 검증 가능한 문장으로 쓰기 | 스스로 확인하고 끝낸다 |
| "주의"에 과거에 당한 실수를 적기 | 같은 실수를 반복하지 않는다 |
| 순수 함수는 "테스트 같이 작성"을 명시 | 나중에 테스트를 붙이면 안 붙인다 |
| 큰 기능은 5-1 / 5-2 / 5-3으로 쪼개기 | 한 응답에 다 넣으면 품질이 떨어진다 |
| 문서 경로를 직접 지목 (`TRD 4.2장`) | 매번 설명을 다시 쓰지 않아도 된다 |

| 피할 것 | 이유 |
|---|---|
| "자막 기능 전부 만들어줘" | 범위가 모호해서 절반만 동작하는 코드가 나온다 |
| "알아서 좋게 해줘" | 임의 리팩터링으로 멀쩡한 코드가 깨진다 |
| 에러 로그 없이 "안 돼요" | 추측 수정이 시작되고 버그가 늘어난다 |
| 한 번에 파일 10개 생성 요청 | 뒤로 갈수록 품질이 급격히 떨어진다 |
