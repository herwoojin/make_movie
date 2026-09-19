# 편집ON 내 컴퓨터 도우미 (editon-helper)

브라우저 혼자서는 못 하는 일만 도와주는 아주 작은 로컬 서버입니다. **없어도 편집ON의 편집 기능은 모두 동작합니다.**

## 무엇을 도와주나요

| 기능 | 필요한 프로그램 |
|---|---|
| 유튜브 영상 받기 | `yt-dlp` |
| 빠른 압축·소리 입히기 (네이티브 ffmpeg) | `ffmpeg` |
| 내 컴퓨터에서 번역 (인터넷 전송 없음) | `ollama` + 모델(기본 `qwen3:4b`) |
| 내 목소리 TTS | `EDITON_TTS_COMMAND` 로 지정한 실행 명령 |
| 원하는 폴더에 저장 · 탐색기 열기 | — |

없는 프로그램은 `/health`의 `features`에서 `false`로 나가고, 웹앱은 그 기능만 잠급니다.

## 실행

```bash
cd ~/make_movie        # 편집ON 프로젝트 폴더
npm run helper
```

> `npx editon-helper`는 npm에 배포한 뒤에 쓸 수 있습니다. 아직 배포 전이라 지금은 위 명령을 씁니다.
> 배포 주소 `https://1u2v.netlify.app`은 기본으로 허용돼 있습니다. 다른 주소를 더 쓰려면: `EDITON_ORIGINS=https://다른주소 npm run helper`

처음 실행하면 토큰을 만들어 보여 주고 `~/.editon/token`(권한 600)에 저장합니다.
웹앱 → **설정 → 내 컴퓨터 도우미**에 그 토큰을 붙여넣으면 연결됩니다.

## 안전 규칙

- **`127.0.0.1:47600` 에만 바인딩합니다.** 다른 기기에서는 접속할 수 없습니다. (`0.0.0.0` 바인딩 없음)
- 모든 요청에 `Authorization: Bearer <토큰>` 이 필요합니다. 없으면 401입니다.
- CORS는 `http://localhost:3000`, 배포 주소 `https://1u2v.netlify.app`, 그리고 `EDITON_ORIGINS`로 지정한 도메인만 허용합니다.
- 영상·오디오 파일은 이 컴퓨터 안에서만 오갑니다.

## 환경 변수

| 이름 | 기본값 | 설명 |
|---|---|---|
| `EDITON_ORIGINS` | — | 쉼표로 구분한 추가 허용 도메인 (배포 주소) |
| `EDITON_OUT_DIR` | `~/Videos/EditON` | 결과를 저장할 기본 폴더 |
| `EDITON_TRANSLATE_MODEL` | `qwen3:4b` | Ollama 번역 모델 |
| `EDITON_TTS_COMMAND` | — | TTS 실행 명령. `--text --out [--ref-audio --ref-text --emotion]` 인자를 받는 프로그램 |

## API

```
GET  /health                  → { ok, version, features, paths, models, outDir }
POST /youtube/download        { url, quality, outDir? }      → SSE → { filePath, title, fileSize }
POST /ffmpeg/run              { args[], outPath, durationMs } → SSE → { outPath, size }
POST /translate               { cues[], tone, glossary, mode } → SSE → [{ …, translated }]
POST /tts/generate            { text, refAudioPath?, refText?, emotion? } → SSE → { wavPath }
POST /fs/pick-folder          {}                 → { path }
POST /fs/open-folder          { path }           → { ok }
POST /fs/save                 multipart(file,dir) → { path }
POST /fs/temp                 multipart(file)     → { path }
GET  /fs/read?path=…                              → 파일 내용
```

## 개발

```bash
cd packages/helper
npm install
npm test        # 토큰·바인딩·진행률 파싱 테스트
npm start
```
