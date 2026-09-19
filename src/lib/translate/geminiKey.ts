// Gemini 키 붙여넣기 정리. 키 칸은 비밀번호 칸이라 내용이 안 보여서,
// 옛 키 뒤에 새 키를 이어 붙이거나 공백·따옴표·"key=" 같은 글자가 섞이는 일이 흔하다.

/** 구글 API 키 모양: AIza + 35자 (총 39자) */
const KEY_RE = /AIza[0-9A-Za-z_-]{35}/g;

function stripNoise(raw: string): string {
  // 공백·줄바꿈·보이지 않는 글자·따옴표 제거
  let s = raw.replace(/[\s ​-‍⁠﻿"'`]/g, '');
  // 주소째 붙여넣은 경우 (…?key=AIza…)
  const fromUrl = /[?&]key=([^&#]+)/.exec(s);
  if (fromUrl) s = fromUrl[1];
  return s;
}

/**
 * 저장된 값에서 시도해 볼 키들. 키가 여러 개 이어 붙어 있으면 마지막에 붙여넣은 것부터.
 * 키 모양을 찾지 못하면(구글이 형식을 바꾼 경우 등) 정리한 값을 그대로 쓴다.
 */
export function keyCandidates(raw: string): string[] {
  const s = stripNoise(raw);
  const found = s.match(KEY_RE) ?? [];
  if (found.length === 0) return s ? [s] : [];
  return [...new Set(found.reverse())];
}

/** 화면에 보여 줄 키 — 앞 4자와 끝 4자만 (AI Studio 키 목록과 맞춰 볼 수 있게) */
export function maskKey(key: string): string {
  if (!key) return '';
  return key.length > 10 ? `${key.slice(0, 4)}…${key.slice(-4)}` : '••••';
}

/** 붙여넣은 값이 이상해 보이면 이유. 괜찮으면 null (최종 판단은 "키 확인"이 한다) */
export function keyShapeProblem(raw: string): string | null {
  const candidates = keyCandidates(raw);
  if (candidates.length === 0) return null;
  if (candidates.length > 1) return `키가 ${candidates.length}개 이어 붙어 있습니다. 칸을 모두 지우고 새 키만 붙여넣어 주세요. (번역할 때는 쓸 수 있는 키를 찾아 씁니다)`;
  const key = candidates[0];
  if (/^gsk_/.test(key)) return 'Groq 키로 보입니다. Gemini 키는 Google AI Studio에서 받은, AIza로 시작하는 키입니다.';
  if (/:fx$/.test(key)) return 'DeepL 키로 보입니다. DeepL 키는 아래 DeepL 칸에 넣어 주세요.';
  if (!key.startsWith('AIza')) return 'Gemini 키는 보통 AIza로 시작합니다. 키 이름이나 프로젝트 번호가 아니라 키 값 자체를 복사했는지 확인해 주세요.';
  if (key.length !== 39) return `키 길이가 ${key.length}자입니다(보통 39자). 일부만 복사됐을 수 있습니다.`;
  return null;
}
