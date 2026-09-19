# API 키 넣는 법

> 편집ON은 **키가 하나도 없어도** 영상 편집이 전부 됩니다. 아래 키들은 "있으면 더 되는 것"입니다.
> 마지막 업데이트: 2026-09-18 (v2)

## 0. 한눈에 보기

| 키 | 없으면 | 넣는 곳 | 비용 |
|---|---|---|---|
| **Firebase 웹 설정 6개** | 로그인·기기 간 동기화만 안 됨 | `.env.local` + Netlify 환경변수 | 무료 |
| **Gemini API 키** | 해외 영상 번역 불가 | 웹 화면 → 설정 → 번역 | 무료 사용량 있음 |
| **DeepL API 키** (선택) | Gemini만 씀 | 웹 화면 → 설정 → 번역 | 월 50만 자 무료 |
| **Groq API 키** (선택) | 브라우저 내장 Whisper로 자막 생성 (느리지만 됨) | 웹 화면 → 설정 → 음성 인식 | 무료 사용량 있음 |
| **도우미 토큰** (키 아님) | 유튜브 받기·내 목소리 TTS·빠른 압축만 잠김 | 웹 화면 → 설정 → 내 컴퓨터 도우미 | 무료 |

**키가 없어도 되는 기능**: 무음·추임새 자동 컷, 단어 칩 편집, 자막 만들기(브라우저 내장 Whisper), 자막 서식, 화면 비율, 배속, 얼굴 모자이크, 내보내기, GIF·이미지·오디오 도구, 영상 용량 줄이기, 소리 입히기.

---

## 1. Firebase — 로그인과 동기화 (이미 로컬은 설정됨)

프로젝트 `make-movie-525c0` 값이 `.env.local`에 들어가 있어 **로컬(localhost:3000)에서는 이미 동작**합니다.
**배포본에서도 로그인이 되게 하려면 Netlify에 같은 값을 넣어야 합니다.**

### 1-1. 값을 어디서 가져오나

Firebase 콘솔 → 톱니바퀴(프로젝트 설정) → **일반** → 아래 "내 앱"의 웹 앱(`make_movie`) → **SDK 설정 및 구성** → `firebaseConfig`

거기 나오는 값과 변수 이름이 이렇게 짝지어집니다.

| firebaseConfig 항목 | 환경변수 이름 |
|---|---|
| `apiKey` | `NEXT_PUBLIC_FIREBASE_API_KEY` |
| `authDomain` | `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` |
| `projectId` | `NEXT_PUBLIC_FIREBASE_PROJECT_ID` |
| `appId` | `NEXT_PUBLIC_FIREBASE_APP_ID` |
| `storageBucket` | `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` |
| `messagingSenderId` | `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` |

> `measurementId`(G-로 시작)는 쓰지 않습니다. 3자 분석 스크립트를 넣지 않는 원칙이고, 격리 헤더(COEP)에도 막힙니다.

### 1-2. Netlify에 넣기 (배포본용)

1. Netlify → 해당 사이트 → **Site configuration** → **Environment variables**
2. **Add a variable** → **Add a single variable** 로 위 6개를 하나씩 추가
   - Key: 표의 변수 이름 그대로 (대문자·밑줄까지 정확히)
   - Value: firebaseConfig의 값 (따옴표 없이)
   - Scopes: **Builds** 포함 (기본값 그대로 두면 됩니다)
3. **Deploys → Trigger deploy → Deploy site**
   `NEXT_PUBLIC_*`는 **빌드할 때** 번들에 들어갑니다. 값을 바꾸면 반드시 다시 배포해야 반영됩니다.

### 1-3. 배포 주소를 Firebase에 등록 (안 하면 로그인 팝업이 막힙니다)

Firebase 콘솔 → **Authentication** → **설정** → **승인된 도메인** → `여러분의사이트.netlify.app` 추가
(커스텀 도메인을 붙였다면 그것도 추가. `localhost`는 기본 포함되어 있습니다.)

> 로그인할 때 `auth/unauthorized-domain` 오류가 나면 이 단계를 빼먹은 것입니다.

### 1-4. 이 값들은 비밀인가요?

**아닙니다.** Firebase 웹 설정 6개는 공개 식별자이고 브라우저 번들에 그대로 들어갑니다. 실제 보호는 `firestore.rules`(본인 문서만 읽기/쓰기)와 승인된 도메인이 합니다.

⚠️ **반대로 진짜 비밀인 것**: Google 콘솔의 **웹 클라이언트 보안 비밀번호(client secret)** 는 이 앱 어디에도 넣지 않습니다. `.env.local`, Netlify, 코드 어디에도 붙여넣지 마세요. 서버 없는 구조라 쓸 일이 없습니다.

---

## 2. Gemini — 해외 영상 한국어 자막 (권장)

1. https://aistudio.google.com/apikey 접속 → Google 계정 로그인
2. **Create API key** → 프로젝트 선택(없으면 새로 만들기) → 키 복사 (`AIza...`로 시작)
3. 편집ON에서 **설정** 화면 → **번역 (해외 영상 자막)** → **Gemini API 키** 칸에 붙여넣기
4. 같은 칸 위의 **기본 번역 엔진**을 `Gemini (내 API 키)`로 두면 끝

- 저장 위치: **이 브라우저의 localStorage**. 저희 서버로는 전송되지 않습니다.
- 번역 시 **자막 글자만** 구글로 갑니다. 영상·소리 파일은 절대 전송되지 않습니다.
- 무료 사용량을 넘기면 "사용량 한도에 걸렸습니다" 안내가 뜹니다. 잠시 뒤 다시 하거나 DeepL로 바꾸세요.

---

## 3. DeepL — 번역 대체 엔진 (선택)

1. https://www.deepl.com/pro-api → **DeepL API Free** 가입 (카드 등록이 필요할 수 있습니다)
2. 계정 → **API keys** → 키 복사 (무료 키는 **`:fx`로 끝납니다**)
3. 편집ON **설정 → 번역 → DeepL API 키** 에 붙여넣기

> ⚠️ DeepL은 브라우저에서 직접 호출하는 것을 막는 경우가 있습니다(CORS).
> 그때는 "브라우저에서 바로 연결하지 못했습니다" 안내가 뜨고, **Gemini로 바꾸거나 내 컴퓨터 도우미**를 켜면 됩니다.

---

## 4. Groq — 빠른 음성 인식 (선택)

브라우저 내장 Whisper로도 자막이 만들어집니다. 긴 영상을 자주 다루면 Groq이 훨씬 빠릅니다.

1. https://console.groq.com/keys → 로그인 → **Create API Key** → 복사 (`gsk_...`)
2. 편집ON **설정 → 음성 인식 (자막 만들기)** → **Groq API 키 (내 키 쓰기, 선택)** 칸에 붙여넣기
3. 아래 **"이 브라우저에만 저장된다는 것을 확인했습니다"** 체크 → **저장**
4. 같은 화면 위쪽 **기본 엔진**을 `Groq`으로 바꾸면 적용됩니다.
   쓰기 직전에 **"오디오가 외부 서버로 전송됩니다"** 고지가 한 번 더 뜹니다. 민감한 영상이면 브라우저 내장을 쓰세요.

---

## 5. 내 컴퓨터 도우미 토큰 (API 키 아님)

유튜브 받기 · 내 목소리 TTS · 내 컴퓨터 번역 · 빠른 압축 · 원하는 폴더에 저장을 쓰려면 필요합니다.

```bash
cd ~/make_movie        # 편집ON 프로젝트 폴더
npm run helper
```

> `npx editon-helper`는 npm에 배포한 뒤에 쓸 수 있습니다. 아직 배포 전이라 지금은 위 명령을 씁니다.
> 배포한 사이트(https)에서 쓸 때는 주소를 허용해 주세요: `EDITON_ORIGINS=https://내사이트.netlify.app npm run helper`

실행하면 터미널에 이렇게 나옵니다.

```
  편집ON 내 컴퓨터 도우미가 켜졌습니다.
  주소: http://127.0.0.1:47600   (이 컴퓨터에서만 접속됩니다)

  토큰: 2f4U...          ← 이 줄을 복사
```

편집ON **설정 → 내 컴퓨터 도우미 → 연결 토큰** 에 붙여넣고 **다시 확인**을 누르면 "연결됨"으로 바뀝니다.

- 토큰은 `~/.editon/token` 에 저장되며 다음 실행부터 같은 값을 씁니다.
- 도우미는 `127.0.0.1`에서만 듣습니다. 다른 기기에서는 접속할 수 없습니다.
- 기능별로 필요한 프로그램: 유튜브=`yt-dlp`, 빠른 압축=`ffmpeg`, 번역=`ollama`, TTS=`EDITON_TTS_COMMAND` 지정.
  없으면 그 기능만 잠기고 나머지는 그대로 동작합니다. (macOS: `brew install yt-dlp ffmpeg`)

---

## 6. 안전 수칙

- BYOK 키(Gemini·DeepL·Groq)는 **브라우저에만** 저장되고 저희 서버로 나가지 않습니다. 공용 컴퓨터에서는 다 쓰고 칸을 비우세요.
- 영상·오디오 파일은 어떤 경우에도 저희 서버로 올라가지 않습니다. 외부로 나가는 것은 (선택했을 때) **Groq에 오디오**, **번역 엔진에 자막 글자**뿐이고, 둘 다 쓰기 직전에 고지합니다.
- `.env.local` 과 `.firebaserc` 는 `.gitignore`에 있어 GitHub에 올라가지 않습니다.
- 키가 노출된 것 같으면: Gemini/Groq/DeepL은 각 콘솔에서 **삭제 후 재발급**, 도우미 토큰은 `~/.editon/token` 파일을 지우고 다시 실행하면 새로 만들어집니다.
