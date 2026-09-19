// 번역 프롬프트 조립과 응답 파싱. 모델이 바뀌어도 이 규칙은 그대로 쓴다.
import { formatGlossary, relevantTerms } from './glossary';
import type { TranslateCue, TranslateTone } from './types';

export const TONE_PROMPTS: Record<TranslateTone, string> = {
  literal: '원문의 말투와 문장 길이를 최대한 그대로 살려라. 원문이 반말이면 반말로, 존댓말이면 존댓말로 옮겨라.',
  friendly: '친근하고 부드러운 해요체로 옮겨라. 딱딱한 번역투를 쓰지 마라.',
  formal: '격식 있는 합쇼체(–습니다)로 옮겨라.',
  casual: '구어체 반말로 옮겨라. 실제 대화처럼 짧고 자연스럽게.',
};

const BASE_RULES = [
  '너는 영상 자막 번역가다.',
  '각 줄은 화면에 잠깐 떴다 사라지는 자막이다. 한 줄이 너무 길어지지 않게 간결하게 옮겨라.',
  '줄 수를 바꾸지 마라. 입력이 N개면 출력도 정확히 N개다.',
  '원문을 그대로 베끼지 마라. 모든 줄을 한글로 적어라. 뜻을 알 수 없는 소리나 같은 말이 되풀이되는 줄은 소리 나는 대로 한글로 짧게 적어라.',
  '설명·사과·머리말을 쓰지 마라. JSON 배열만 출력하라.',
].join(' ');

const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HANGUL = /\p{Script=Hangul}/u;
const HAN = /\p{Script=Han}/u;
const LETTER = /\p{L}/u;

/**
 * 한국어로 옮겨지지 않은 줄인지 — 모델이 원문을 베꼈거나(가나·한자만 남음), 줄이 밀려 괄호 같은 부스러기만 왔다.
 * "OK"·"iPhone 15"처럼 원래 그대로 쓰는 짧은 외국어는 번역으로 인정한다.
 */
export function looksUntranslated(source: string, translated: string): boolean {
  const t = translated.trim();
  if (!t) return true;
  if (KANA.test(t)) return true;
  if (HANGUL.test(t)) return false;
  if (HAN.test(t)) return true;
  if (!LETTER.test(t)) return LETTER.test(source);
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return norm(t) === norm(source) && source.trim().split(/\s+/).length >= 3;
}

export function buildTranslatePrompt(
  texts: readonly string[], opts: { sourceLang: string; tone: TranslateTone; glossary: Record<string, string> },
): string {
  const terms = relevantTerms(texts, opts.glossary);
  const source = opts.sourceLang === 'auto' ? '자동 감지된 언어' : opts.sourceLang;
  return [
    BASE_RULES,
    TONE_PROMPTS[opts.tone],
    `원어: ${source} → 한국어로 옮긴다.`,
    Object.keys(terms).length ? `다음 용어는 반드시 이렇게 옮겨라: ${formatGlossary(terms)}` : '',
    `입력(JSON 문자열 배열, ${texts.length}개):`,
    JSON.stringify(texts, null, 0),
    `출력: 같은 순서, 같은 개수(${texts.length}개)의 한국어 문자열 JSON 배열만.`,
  ].filter(Boolean).join('\n');
}

export function buildReviewPrompt(
  pairs: readonly { text: string; translated: string }[],
  opts: { tone: TranslateTone; glossary: Record<string, string>; contextBefore?: readonly string[] },
): string {
  const terms = relevantTerms(pairs.map((p) => p.text), opts.glossary);
  return [
    '너는 영상 자막 번역 감수자다. 아래는 이미 한 번 번역된 자막이다.',
    '앞뒤 문맥을 보고 인칭·호칭·용어·존댓말을 한 편의 영상처럼 일관되게 고쳐라.',
    TONE_PROMPTS[opts.tone],
    '뜻이 맞는 문장은 그대로 두어도 된다. 줄 수를 바꾸지 마라. 원문을 출력하지 말고 번역을 고친 한국어만 출력하라.',
    Object.keys(terms).length ? `용어 지정: ${formatGlossary(terms)}` : '',
    opts.contextBefore?.length ? `바로 앞 자막(참고만, 출력하지 마라): ${JSON.stringify(opts.contextBefore)}` : '',
    `입력(JSON, ${pairs.length}개):`,
    JSON.stringify(pairs.map((p) => ({ 원문: p.text, 번역: p.translated }))),
    `출력: 고친 한국어 문자열 ${pairs.length}개의 JSON 배열만.`,
  ].filter(Boolean).join('\n');
}

/**
 * 모델이 ```json 울타리나 앞뒤 설명을 붙여도 배열만 꺼낸다.
 * strict면 개수가 정확히 맞을 때만 돌려준다 — 개수가 다르면 번역이 다른 줄로 밀려 있을 수 있다.
 */
export function parseJsonArray(text: string, expected: number, { strict = false } = {}): string[] | null {
  const cleaned = text.replace(/```json/gi, '```').split('```').map((s) => s.trim()).filter(Boolean);
  const candidates = [text, ...cleaned];
  for (const candidate of candidates) {
    const start = candidate.indexOf('[');
    const end = candidate.lastIndexOf(']');
    if (start < 0 || end <= start) continue;
    try {
      const parsed: unknown = JSON.parse(candidate.slice(start, end + 1));
      if (!Array.isArray(parsed)) continue;
      const strings = parsed.map((v) => (typeof v === 'string' ? v : typeof v === 'object' && v !== null ? String((v as Record<string, unknown>).번역 ?? (v as Record<string, unknown>).translated ?? '') : String(v)));
      if (strings.length === expected) return strings;
      if (strict) continue;
      // 개수가 다르면 앞에서부터 맞는 만큼만 쓰고 나머지는 호출한 쪽이 원문을 유지한다
      if (strings.length > 0) return strings.slice(0, expected);
    } catch {
      // 다음 후보로
    }
  }
  return null;
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function cueTexts(cues: readonly TranslateCue[]): string[] {
  return cues.map((c) => c.text);
}
