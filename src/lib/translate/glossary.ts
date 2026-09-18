// 용어 지정 (F-07-4). "Sunburst=선버스트, fidelity=정확도" 처럼 적는다.
// 번역 모델에 넣기 전에 규칙을 알려주고, 결과에서 빠진 용어는 뒤에서 한 번 더 맞춰 준다.

/** 정규식에서 뜻을 갖는 글자를 막는다 */
function escapeRe(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * "A=B, C=D" 또는 줄바꿈으로 나눈 목록을 파싱한다.
 * 빈 줄·형식이 어긋난 줄은 조용히 건너뛴다 (사용자가 입력하는 중일 수 있다).
 */
export function parseGlossary(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/[\n,]/)) {
    const [from, ...rest] = line.split(/[=:→]/);
    const to = rest.join('=').trim();
    const key = from?.trim();
    if (!key || !to) continue;
    out[key] = to;
  }
  return out;
}

export function formatGlossary(glossary: Record<string, string>): string {
  return Object.entries(glossary).map(([k, v]) => `${k}=${v}`).join(', ');
}

/** 알파벳·숫자로만 된 용어인지 (한국어 조사가 바로 붙는 경우를 구분하기 위해) */
function isLatin(term: string): boolean {
  return /^[\p{Script=Latin}\p{N}\s.'+-]+$/u.test(term);
}

/**
 * 용어 하나를 찾는 정규식.
 * 영문 용어는 앞뒤가 영문·숫자면 건너뛴다("fidelity"가 "infidelity"에 걸리지 않게).
 * 한국어 조사("Sunburst를")는 정상적으로 붙으므로 뒤가 한글인 것은 막지 않는다.
 * 한자·한글 용어는 띄어쓰기가 없을 수 있어 경계를 두지 않는다.
 */
export function termPattern(term: string): RegExp {
  const body = escapeRe(term);
  return isLatin(term)
    ? new RegExp(`(?<![\\p{Script=Latin}\\p{N}])${body}(?![\\p{Script=Latin}\\p{N}])`, 'giu')
    : new RegExp(body, 'gu');
}

/**
 * 번역 결과에 용어가 원어 그대로 남아 있으면 지정한 말로 바꾼다.
 * 한 번에 훑어야 "GPT Image"를 바꾼 자리에 "GPT" 규칙이 다시 걸리지 않는다.
 */
export function applyGlossary(text: string, glossary: Record<string, string>): string {
  const terms = Object.keys(glossary).filter(Boolean).sort((a, b) => b.length - a.length);
  if (terms.length === 0) return text;
  const lookup = new Map(terms.map((t) => [t.toLowerCase(), glossary[t]]));
  const replaceWith = (m: string) => lookup.get(m.toLowerCase()) ?? m;

  let out = text;
  const latin = terms.filter(isLatin);
  if (latin.length) {
    const re = new RegExp(`(?<![\\p{Script=Latin}\\p{N}])(?:${latin.map(escapeRe).join('|')})(?![\\p{Script=Latin}\\p{N}])`, 'giu');
    out = out.replace(re, replaceWith);
  }
  const other = terms.filter((t) => !isLatin(t));
  if (other.length) {
    out = out.replace(new RegExp(`(?:${other.map(escapeRe).join('|')})`, 'gu'), replaceWith);
  }
  return out;
}

/** 이 문장에 들어 있는 용어만 추려 프롬프트를 짧게 유지한다 */
export function relevantTerms(texts: readonly string[], glossary: Record<string, string>): Record<string, string> {
  const joined = texts.join('\n');
  const out: Record<string, string> = {};
  for (const [term, to] of Object.entries(glossary)) {
    if (termPattern(term).test(joined)) out[term] = to;
  }
  return out;
}
