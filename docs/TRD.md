# TRD — 편집ON (EditON)

> 기술 요구사항 정의서 / v1.0 / 2026-09-13
> 전제: **모든 미디어 처리는 클라이언트에서. 서버는 인증과 메타데이터만.**

---

## 1. 아키텍처 개요

```
┌────────────────────────────── 브라우저 (모든 무거운 작업) ──────────────────────────────┐
│                                                                                        │
│  UI 레이어 (Next.js 14 App Router / React / Tailwind / shadcn-ui)                       │
│    └ Zustand 스토어: 프로젝트 상태 · 타임라인 · 편집 결정(EDL)                            │
│                        │                                                               │
│  ┌─────────────────────┴─────────────────────────────────────────────────────────┐    │
│  │  Worker 레이어 (메인 스레드 절대 블로킹 금지)                                    │    │
│  │                                                                                 │    │
│  │  ① audio.worker    Web Audio 디코드 → RMS 무음 분석 → 파형 피크                  │    │
│  │  ② stt.worker      transformers.js Whisper (WebGPU) or BYOK API 호출            │    │
│  │  ③ vision.worker   MediaPipe FaceDetector → 얼굴 박스 + 트래킹 ID               │    │
│  │  ④ encode.worker   WebCodecs(1순위) / ffmpeg.wasm(폴백) 디코드·필터·먹싱          │    │
│  │  ⑤ storage.worker  OPFS SyncAccessHandle 대용량 read/write                      │    │
│  └─────────────────────────────────────────────────────────────────────────────────┘    │
│                        │                                                               │
│  저장 레이어                                                                            │
│    OPFS      : 원본 미디어, 중간 산출물, 내보내기 결과 (바이너리)                        │
│    IndexedDB : 프로젝트 메타·EDL·자막·모자이크 트랙 (Dexie 4)                            │
│    localStorage : UI 설정, BYOK API 키(사용자 동의 후)                                   │
└────────────────────────────────────────────────────────────────────────────────────────┘
                        │  (선택 / 메타데이터만, 영상 절대 업로드 안 함)
┌───────────────────────┴────────────────────────────────────────────────────────────────┐
│  Firebase Spark  :  Auth(Google) · Firestore users/{uid}/stylePresets·fillerDictionaries·projectMeta │
│  Netlify         :  GitHub 연동 자동 배포 · Next 런타임 · 헤더(COOP/COEP, /login 제외)        │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### 핵심 설계 원칙
1. **비파괴 편집(Non-destructive)**: 원본 파일은 읽기 전용. 모든 편집은 EDL(Edit Decision List) 데이터로만 존재하고, 내보내기 시점에 한 번 렌더링한다.
2. **메인 스레드 0ms 블로킹**: 100ms 넘게 걸리는 모든 연산은 Worker로 보낸다.
3. **어댑터 패턴**: 인코더·STT·번역은 전부 인터페이스로 감싸서 구현체를 갈아끼울 수 있게 한다.
4. **점진적 저하(Graceful degradation)**: WebGPU 없으면 WASM, WebCodecs 없으면 ffmpeg, OPFS 없으면 메모리. 느려도 동작은 한다.

---

## 2. 기술 스택

| 영역 | 선택 | 버전 | 비고 |
|---|---|---|---|
| 프레임워크 | Next.js (App Router) | 14.2.x | `output: 'export'` 아님. 헤더 설정 위해 서버 필요 |
| 언어 | TypeScript | 5.4+ | `strict: true` |
| 스타일 | Tailwind CSS | 3.4.x | |
| UI 컴포넌트 | shadcn/ui | latest | Radix 기반, self-host |
| 상태관리 | Zustand + immer | 4.5.x | 타임라인 상태, undo/redo 미들웨어 |
| 로컬 DB | Dexie | 4.x | IndexedDB 래퍼 |
| 미디어 인코딩 | WebCodecs API | 네이티브 | 1순위 |
| 미디어 인코딩(폴백) | @ffmpeg/ffmpeg + @ffmpeg/core-mt | 0.12.x | SharedArrayBuffer 필요 |
| MP4 컨테이너 | mp4box.js (demux) + mp4-muxer (mux) | latest | WebCodecs 경로용 |
| 음성 인식 | @huggingface/transformers | 3.x | Whisper ONNX, WebGPU |
| 얼굴 검출 | @mediapipe/tasks-vision | 0.10.x | FaceDetector (blaze_face_short_range) |
| 파형 렌더 | 자체 Canvas 구현 | — | wavesurfer는 무거움, 피크 데이터만 직접 그림 |
| 백엔드 | Firebase (Auth + Cloud Firestore) | JS SDK 12.x | Google 로그인 + 프리셋·사전·프로젝트 기록 동기화, Spark(무료) 요금제 |
| 배포 | GitHub → Netlify | — | main push 시 자동 배포, `netlify.toml`. CI는 GitHub Actions |
| 테스트 | Vitest + Playwright | — | 단위 + E2E |

### 의존성 최소 원칙
COEP `require-corp` 환경에서는 **CDN에서 불러오는 모든 리소스가 차단**된다. 따라서:
- Google Fonts → `next/font/local`로 self-host (Pretendard 권장)
- ffmpeg core wasm → `/public/ffmpeg/`에 직접 배치
- MediaPipe wasm + tflite 모델 → `/public/mediapipe/`에 직접 배치
- Whisper ONNX 모델 → HuggingFace CDN 사용 시 COEP `credentialless` 필요, 또는 self-host

---

## 3. 서버 설정 (가장 먼저 검증할 것)

### 3.1 COOP/COEP 헤더

`next.config.js`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        { key: 'Cross-Origin-Opener-Policy',   value: 'same-origin' },
        { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
        { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
      ],
    }];
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    return config;
  },
};
module.exports = nextConfig;
```

**검증 코드** (앱 부팅 시 1회):
```ts
export function checkEnv() {
  return {
    crossOriginIsolated: self.crossOriginIsolated,   // true여야 ffmpeg-mt 동작
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    webCodecs: typeof VideoEncoder !== 'undefined',
    webGPU: 'gpu' in navigator,
    opfs: 'storage' in navigator && 'getDirectory' in navigator.storage,
  };
}
```
`crossOriginIsolated === false`면 랜딩에서 경고 배너를 띄우고 단일 스레드 폴백으로 동작한다.

**예외 — `/login`** (2026-09-15, Firebase 전환): `COOP: same-origin` 문서에서는 Firebase Google 로그인 팝업과 통신이 끊긴다.
그래서 `headers()`의 `source`를 `/((?!login).*)`로 두어 로그인 페이지만 격리 헤더 없이 제공하고, 앱 ↔ 로그인 페이지 이동은 항상 전체 새로고침(`<a>`)으로 한다.
Firebase Auth는 `initializeAuth`에 팝업 처리기를 넣지 않아(격리 페이지에서 authDomain iframe이 막히므로) 로그인 페이지에서만 처리기를 넘겨 팝업을 연다.
Netlify에서는 CDN 정적 파일의 헤더를 `netlify.toml`이 붙이므로 `next.config.js`는 그 경로를 제외한다(헤더 중복 방지).

### 3.2 브라우저 지원 정책
| 브라우저 | 지원 수준 |
|---|---|
| Chrome / Edge 데스크톱 111+ | ✅ 전체 기능 (WebCodecs + WebGPU) |
| Firefox 데스크톱 | ⚠️ WebCodecs 부분 지원 → ffmpeg.wasm 폴백 |
| Safari 데스크톱 17+ | ⚠️ 동작하나 느림 |
| iOS Safari | ❌ 편집 미지원. 뷰어·도구함 일부만 |
| Android Chrome | ⚠️ 짧은 영상(3분 이내)만 권장 |

---

## 4. 데이터 흐름 — 핵심 파이프라인

### 4.1 파일 임포트
```
파일 선택
 → OPFS에 원본 스트림 복사 (storage.worker, SyncAccessHandle)
 → 메타 추출: 길이/해상도/fps/코덱 (WebCodecs VideoDecoder config or ffprobe)
 → 오디오 트랙 디코드 → Float32Array PCM (audio.worker)
 → 파형 피크 계산 (1초당 100 포인트로 다운샘플) → IndexedDB 저장
 → 썸네일 스트립 생성 (1초 간격, 160px, WebP) → OPFS 저장
 → projects / media_assets 레코드 생성
```

### 4.2 무음 자동 컷 (P0 핵심 알고리즘)

STT 없이 오디오 에너지만으로 처리한다. 빠르고 무료다.

```ts
interface SilenceParams {
  thresholdDb: number;      // 기본 -35
  minSilenceMs: number;     // 기본 500  — 이보다 짧은 무음은 무시
  paddingMs: number;        // 기본 200  — 컷 앞뒤로 남길 여유
  minKeepMs: number;        // 기본 300  — 이보다 짧은 유지구간은 앞뒤와 병합
}

// 알고리즘
// 1) PCM을 20ms 프레임으로 분할
// 2) 각 프레임 RMS → dBFS 변환:  20 * log10(rms)
// 3) 히스테리시스 적용: 진입 임계 = threshold, 이탈 임계 = threshold + 3dB
//    (경계에서 컷이 잘게 쪼개지는 것 방지)
// 4) 연속 무음 프레임 길이 >= minSilenceMs 인 구간을 후보로 수집
// 5) 각 후보의 시작 += padding, 끝 -= padding
// 6) 남은 유지 구간이 minKeepMs 미만이면 인접 구간과 병합
// 7) 결과를 CutSuggestion[] 으로 반환 (적용은 사용자 확인 후)
```

성능 목표: 20분 영상 오디오 분석 **3초 이내** (Worker, 순수 계산).

### 4.3 추임새 제거

무음 컷과 달리 STT의 **단어 단위 타임스탬프**가 필요하다.

```
STT 실행 (word timestamps)
 → 각 단어를 필러 사전과 대조 (정규화: 공백·문장부호 제거)
 → 매칭된 단어의 [start, end] 구간에 padding 30ms 적용
 → 앞뒤 단어와의 간격이 150ms 미만이면 자연스러운 연결을 위해 구간 확장
 → CutSuggestion[] 으로 반환 (source: 'filler')
```

기본 한국어 필러 사전:
```
어, 음, 그, 저, 아, 뭐, 이제, 그니까, 그러니까, 인제, 어어, 음음, 아아, 그래서 뭐
```
사용자가 추가·삭제 가능. 단, `그`, `저`, `뭐`는 의미 있는 단어로도 쓰이므로 **기본 비활성**으로 두고 사용자가 켜게 한다.

### 4.4 STT 어댑터

```ts
interface SttResult {
  segments: { start: number; end: number; text: string }[];
  words:    { start: number; end: number; text: string; confidence?: number }[];
  language: string;
}

interface SttAdapter {
  id: 'local-whisper' | 'groq' | 'gemini' | 'openai';
  displayName: string;
  requiresApiKey: boolean;
  isAvailable(): Promise<boolean>;
  transcribe(pcm: Float32Array, opts: { language?: string; onProgress?: (p: number) => void }): Promise<SttResult>;
}
```

| 어댑터 | 비용 | 속도(20분 영상) | 단어 타임스탬프 | 비고 |
|---|---|---|---|---|
| `local-whisper` (transformers.js, whisper-base, WebGPU) | **무료** | 3~8분 | ✅ | 최초 모델 다운로드 ~150MB. 기본값 |
| `groq` (BYOK) | 무료 티어 | 30초 내외 | ✅ | 사용자 키 필요 |
| `gemini` (BYOK) | 무료 티어 | 1~2분 | 세그먼트 단위 | 번역도 겸함 |
| `openai` (BYOK) | 유료 | 1분 | ✅ | 선택 |

BYOK 키는 서버로 절대 보내지 않고 브라우저 localStorage에만 저장하며, 저장 전에 "이 브라우저에만 저장됩니다"를 명시적으로 고지한다.

### 4.5 얼굴 검출·추적 (모자이크)

```
1) 프레임 샘플링: 매 프레임이 아니라 5프레임마다 검출 (30fps → 6회/초)
2) MediaPipe FaceDetector(VIDEO 모드)로 bbox + score 획득
3) 프레임 간 트래킹: IoU 기반 그리디 매칭
   - IoU > 0.3 이면 같은 인물 ID로 이어붙임
   - 3프레임 연속 미검출 시 트랙 종료
4) 검출 안 한 프레임은 앞뒤 키프레임 사이 bbox 선형 보간
5) 트랙을 MosaicTrack[] 으로 저장 (인물 ID별 keyframe 배열)
6) 사용자가 인물별로 "가리기/제외" 토글
7) 렌더 시 bbox 영역에만 모자이크 필터 적용
```

모자이크 렌더 (Canvas, GPU 없이도 충분히 빠름):
```ts
// pixelate: 영역을 1/N로 축소 후 imageSmoothingEnabled=false로 원본 크기 복원
// blur:     ctx.filter = `blur(${r}px)` 후 영역만 clip해서 재그리기
// box:      단색 채우기
// emoji:    이모지 텍스트를 bbox에 맞춰 렌더
```

### 4.6 인코더 어댑터

```ts
interface RenderJob {
  edl: EdlSegment[];             // 유지할 구간 목록
  subtitles?: SubtitleCue[];     // 번인할 자막
  mosaicTracks?: MosaicTrack[];  // 적용할 모자이크
  output: { width: number; height: number; fps: number; bitrate: number; format: 'mp4' | 'webm' };
}

interface EncoderAdapter {
  id: 'webcodecs' | 'ffmpeg-wasm';
  isAvailable(): Promise<boolean>;
  render(job: RenderJob, onProgress: (p: Progress) => void, signal: AbortSignal): Promise<Blob>;
}
```

**WebCodecs 경로 (1순위)**
```
mp4box.js로 demux → VideoDecoder → VideoFrame
  → OffscreenCanvas에 그리기
  → 모자이크·자막 오버레이 합성
  → VideoEncoder로 재인코딩 (avc1.42E01E, hardware accel)
오디오: AudioDecoder → PCM 구간 이어붙이기 → AudioEncoder(AAC/Opus)
  → mp4-muxer로 먹싱
```
장점: 하드웨어 가속, 20분 1080p를 실시간의 0.3~0.5배 시간에 처리 가능.

**ffmpeg.wasm 경로 (폴백)**
```bash
# 컷 편집: select 필터로 한 번에 (concat demuxer보다 안정적)
ffmpeg -i in.mp4 \
  -vf "select='between(t,0,3.2)+between(t,5.1,9.8)',setpts=N/FRAME_RATE/TB,\
       subtitles=sub.ass" \
  -af "aselect='between(t,0,3.2)+between(t,5.1,9.8)',asetpts=N/SR/TB" \
  -c:v libx264 -preset ultrafast -crf 23 -c:a aac out.mp4
```
- 자막은 ASS 파일로 만들어 `subtitles` 필터에 넘긴다(스타일 표현력이 drawtext보다 훨씬 낫다).
- 모자이크는 프레임 수가 많으면 필터 체인이 폭발하므로, **ffmpeg 경로에서는 모자이크를 Canvas로 미리 구운 프레임 시퀀스**로 넘긴다.
- `-preset ultrafast` 고정. wasm에서 그 이상은 실용성 없음.

### 4.7 진행률·취소
모든 Worker 작업은 `AbortSignal`을 받고, `postMessage`로 다음 형태를 보고한다.
```ts
type Progress = { phase: 'decode'|'analyze'|'render'|'mux'; done: number; total: number; etaMs?: number };
```

---

## 5. 모듈 구조

```
src/
├─ app/
│  ├─ page.tsx                        랜딩
│  ├─ editor/[projectId]/page.tsx     에디터
│  ├─ tools/page.tsx                  도구함
│  ├─ projects/page.tsx               프로젝트 목록
│  └─ settings/page.tsx               설정
├─ components/
│  ├─ editor/
│  │  ├─ PreviewCanvas.tsx            비디오 + 오버레이 합성 미리보기
│  │  ├─ Timeline/
│  │  │  ├─ TimelineRoot.tsx
│  │  │  ├─ VideoTrack.tsx
│  │  │  ├─ WaveformTrack.tsx         Canvas 파형
│  │  │  ├─ SubtitleTrack.tsx
│  │  │  └─ MosaicTrack.tsx
│  │  ├─ panels/
│  │  │  ├─ AutoCutPanel.tsx
│  │  │  ├─ SubtitlePanel.tsx         1단계/2단계 탭
│  │  │  ├─ MosaicPanel.tsx
│  │  │  └─ ExportPanel.tsx
│  │  └─ TransportBar.tsx
│  └─ ui/                             shadcn
├─ lib/
│  ├─ core/
│  │  ├─ edl.ts                       EDL 생성·병합·적용 (순수함수, 테스트 100%)
│  │  ├─ timecode.ts                  프레임↔초↔타임코드 변환
│  │  └─ undo.ts                      명령 스택
│  ├─ audio/
│  │  ├─ decode.ts                    파일 → PCM
│  │  ├─ silence.ts                   무음 감지 (순수함수)
│  │  └─ peaks.ts                     파형 피크
│  ├─ stt/
│  │  ├─ types.ts
│  │  ├─ localWhisper.ts
│  │  ├─ groq.ts
│  │  ├─ gemini.ts
│  │  └─ fillers.ts                   필러 사전 + 매칭
│  ├─ vision/
│  │  ├─ faceDetect.ts                MediaPipe 래퍼 (살핌ON 재사용)
│  │  ├─ tracker.ts                   IoU 트래킹
│  │  └─ mosaicRender.ts              Canvas 모자이크 필터
│  ├─ encode/
│  │  ├─ types.ts
│  │  ├─ webcodecs/
│  │  └─ ffmpeg/
│  ├─ subtitle/
│  │  ├─ model.ts                     Cue 모델
│  │  ├─ ass.ts                       ASS 생성
│  │  └─ srt.ts                       SRT/VTT 입출력
│  ├─ storage/
│  │  ├─ db.ts                        Dexie 스키마
│  │  ├─ opfs.ts                      OPFS 헬퍼
│  │  └─ quota.ts                     용량 확인·정리
│  └─ firebase/
│     ├─ config.ts                    환경변수·로그인 경로
│     ├─ client.ts                    지연 초기화 (Auth·Firestore)
│     ├─ auth.ts                      Google 팝업 로그인
│     ├─ schema.ts                    문서 구조·검증·동기화 판단 (순수함수)
│     └─ sync.ts                      프리셋·추임새 사전·프로젝트 기록 동기화
├─ workers/
│  ├─ audio.worker.ts
│  ├─ stt.worker.ts
│  ├─ vision.worker.ts
│  ├─ encode.worker.ts
│  └─ storage.worker.ts
├─ store/
│  ├─ projectStore.ts
│  ├─ timelineStore.ts
│  └─ uiStore.ts
└─ types/
```

### Worker 통신 규약
```ts
type WorkerRequest<T = unknown>  = { id: string; type: string; payload: T };
type WorkerResponse<T = unknown> =
  | { id: string; status: 'progress'; progress: Progress }
  | { id: string; status: 'done'; result: T }
  | { id: string; status: 'error'; error: { code: string; message: string } };
```
Transferable(ArrayBuffer, OffscreenCanvas, VideoFrame)은 반드시 transfer list로 넘겨 복사 비용을 없앤다.

---

## 6. 성능 예산

| 작업 | 대상 | 목표 | 측정 방법 |
|---|---|---|---|
| 파일 임포트 → 타임라인 표시 | 20분/1080p/500MB | 15초 | performance.mark |
| 파형 렌더 | 20분 | 3초 | |
| 무음 감지 | 20분 | 3초 | |
| STT (로컬 Whisper base, WebGPU) | 20분 | 8분 | |
| 얼굴 검출·추적 | 20분 | 5분 | |
| 내보내기 (WebCodecs) | 20분/1080p | 8분 | |
| 내보내기 (ffmpeg.wasm) | 20분/1080p | 40분 (경고 표시) | |
| 타임라인 스크럽 프레임률 | — | 30fps 이상 | |
| 메인 스레드 long task | — | 50ms 초과 0건 | Performance Observer |

메모리: 처리 중 peak 2GB 이내. 초과 시 `performance.memory` 감시로 경고 후 청크 크기 축소.

---

## 7. 보안·프라이버시

| 항목 | 정책 |
|---|---|
| 영상 파일 | 서버 전송 없음. OPFS(브라우저 샌드박스)에만 저장 |
| BYOK API 키 | localStorage 저장, 서버 전송 없음, 설정에서 즉시 삭제 가능 |
| STT BYOK 사용 시 | 오디오가 해당 API 제공사로 전송됨을 **사용 직전 모달로 명시 고지** |
| 익명 사용 | 로그인 없이 전 기능 사용 가능 |
| Firestore 보안 규칙 | `users/{uid}` 아래 본인만 읽기·쓰기, 허용 필드·타입·길이 검사 (`firestore.rules`). Storage는 전부 거부 (`storage.rules`) |
| 로그인 | Google(Firebase Auth). `/login`만 격리 헤더 없음. 승인된 도메인에 배포 주소 등록 필수 |
| 분석 도구 | 3자 분석 스크립트 미사용 (COEP 충돌 + 프라이버시) |
| CSP | `script-src 'self'`, `worker-src 'self' blob:`, `connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://api.groq.com https://huggingface.co ...` (미적용, 배포 전 결정) |

---

## 8. 오류 처리

```ts
type AppErrorCode =
  | 'UNSUPPORTED_BROWSER' | 'NOT_CROSS_ORIGIN_ISOLATED'
  | 'FILE_TOO_LARGE' | 'UNSUPPORTED_CODEC' | 'QUOTA_EXCEEDED'
  | 'DECODE_FAILED' | 'ENCODE_FAILED' | 'OOM'
  | 'STT_MODEL_LOAD_FAILED' | 'STT_API_ERROR' | 'API_KEY_INVALID'
  | 'ABORTED';
```
모든 에러는 **사용자가 다음에 무엇을 하면 되는지**를 함께 표시한다.
> ❌ `ENCODE_FAILED: avc1 not supported`
> ✅ "이 브라우저에서 MP4 내보내기가 안 됩니다. WebM으로 내보내거나 Chrome을 써보세요. [WebM으로 내보내기]"

---

## 9. 테스트 전략

| 계층 | 도구 | 대상 |
|---|---|---|
| 단위 | Vitest | `lib/core/edl.ts`, `lib/audio/silence.ts`, `lib/subtitle/*`, `lib/vision/tracker.ts` — 순수 함수는 커버리지 90% |
| 통합 | Vitest + happy-dom | Worker 메시지 프로토콜, Dexie 스키마 마이그레이션 |
| E2E | Playwright (Chromium) | 5초짜리 테스트 영상으로 임포트→자동컷→내보내기 풀 시나리오 |
| 수동 | 체크리스트 | 실제 20분 영상, 브라우저 4종 |

E2E용 픽스처: 5초/640x360/무음 2구간이 명확한 테스트 MP4를 `tests/fixtures/`에 커밋.

---

## 10. 배포

```
GitHub main 브랜치 push → GitHub Actions(타입·린트·단위 테스트·빌드) + Netlify 자동 배포
필수 확인:
  1. node scripts/check-deploy.mjs https://<사이트>.netlify.app — 격리 헤더가 페이지·정적 파일에 1회씩, /login 에는 없음, wasm·모델 200
  2. 브라우저 콘솔에서 crossOriginIsolated === true
  3. Google 로그인 → 설정 > 프리셋 동기화 성공
  4. Lighthouse: Performance 80+, Accessibility 95+
```

환경변수 (`.env.local`, Netlify 사이트 환경변수):
```
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
```
Firebase 웹 설정 값은 공개 식별자다. 데이터 보호는 `firestore.rules`와 승인된 도메인이 담당한다.
그 외 API 키는 서버에 두지 않는다(전부 BYOK).
