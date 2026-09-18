// 토큰: 처음 실행할 때 만들어 ~/.editon/token 에 두고, 모든 요청에서 확인한다.
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const CONFIG_DIR = join(homedir(), '.editon');
export const TOKEN_PATH = join(CONFIG_DIR, 'token');

export function loadOrCreateToken(path = TOKEN_PATH) {
  if (existsSync(path)) {
    const saved = readFileSync(path, 'utf8').trim();
    if (saved.length >= 16) return saved;
  }
  const token = randomBytes(24).toString('base64url');
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(path, `${token}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600); // 다른 사용자가 읽지 못하게
  } catch {
    // 윈도우에서는 권한 설정이 없을 수 있다
  }
  return token;
}

/** Authorization 헤더에서 토큰을 꺼낸다 */
export function bearerToken(header) {
  if (typeof header !== 'string') return '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : '';
}

/** 길이가 달라도 같은 시간이 걸리도록 비교한다 */
export function tokenMatches(expected, given) {
  if (!expected || !given || expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
