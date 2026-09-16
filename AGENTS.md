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
