// @vitest-environment node
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseFfmpegTime, parseYtdlpProgress, ytdlpFormat } from './bin.js';
import { allowedOrigins, DEFAULT_ORIGINS, HOST, PORT } from './server.js';
import { bearerToken, loadOrCreateToken, tokenMatches } from './token.js';

describe('토큰', () => {
  it('처음 실행하면 만들고, 다음부터는 같은 값을 쓴다', () => {
    const path = join(mkdtempSync(join(tmpdir(), 'editon-')), 'token');
    const first = loadOrCreateToken(path);
    expect(first.length).toBeGreaterThanOrEqual(16);
    expect(readFileSync(path, 'utf8').trim()).toBe(first);
    expect(loadOrCreateToken(path)).toBe(first);
  });

  it('Authorization 헤더에서 꺼낸다', () => {
    expect(bearerToken('Bearer abc123')).toBe('abc123');
    expect(bearerToken('bearer  spaced ')).toBe('spaced');
    expect(bearerToken('Basic abc')).toBe('');
    expect(bearerToken(undefined)).toBe('');
  });

  it('길이가 다르거나 비어 있으면 통과하지 않는다', () => {
    expect(tokenMatches('abcdef', 'abcdef')).toBe(true);
    expect(tokenMatches('abcdef', 'abcdeg')).toBe(false);
    expect(tokenMatches('abcdef', 'abc')).toBe(false);
    expect(tokenMatches('', '')).toBe(false);
  });
});

describe('바인딩·출처', () => {
  it('127.0.0.1에만 붙는다 (외부 접속 금지)', () => {
    expect(HOST).toBe('127.0.0.1');
    expect(PORT).toBe(47_600);
  });
  it('허용 출처는 로컬·배포 주소와 환경변수로 준 도메인뿐', () => {
    expect(allowedOrigins('')).toEqual(DEFAULT_ORIGINS);
    expect(DEFAULT_ORIGINS).toContain('https://1u2v.netlify.app');
    expect(DEFAULT_ORIGINS.some((o) => o.includes('*'))).toBe(false);
    expect(allowedOrigins('https://editon.example')).toContain('https://editon.example');
    expect(allowedOrigins('')).not.toContain('*');
  });
});

describe('진행률 파싱', () => {
  it('yt-dlp 퍼센트', () => {
    expect(parseYtdlpProgress('[download]  42.3% of 12.34MiB at 1.2MiB/s')).toBe(42.3);
    expect(parseYtdlpProgress('[info] 그냥 로그')).toBeNull();
  });
  it('ffmpeg 시간', () => {
    expect(parseFfmpegTime('frame= 10 time=00:00:02.50 bitrate=')).toBe(2500);
    expect(parseFfmpegTime('시간 없음')).toBeNull();
  });
});

describe('yt-dlp 화질', () => {
  it('선택에 따라 포맷 문자열이 달라진다', () => {
    expect(ytdlpFormat('audio')).toContain('bestaudio');
    expect(ytdlpFormat('720p')).toContain('height<=720');
    expect(ytdlpFormat('1080p')).toContain('height<=1080');
    expect(ytdlpFormat(undefined)).toContain('height<=1080');
    expect(ytdlpFormat('best')).toBe('bestvideo+bestaudio/best');
  });
});
