import { describe, expect, it } from 'vitest';
import { isFirebaseConfigured, parseFirebaseConfig, safeNextPath } from './config';

describe('parseFirebaseConfig', () => {
  const full = { apiKey: 'k', authDomain: 'x.firebaseapp.com', projectId: 'x', appId: '1:2:web:3' };
  it('필수 4개가 있으면 설정, 선택 값은 있을 때만', () => {
    expect(parseFirebaseConfig(full)).toEqual(full);
    expect(parseFirebaseConfig({ ...full, storageBucket: ' b ', messagingSenderId: '' })).toEqual({ ...full, storageBucket: 'b' });
  });
  it('하나라도 비면 null (앱은 로그인 없이 동작)', () => {
    expect(parseFirebaseConfig({ ...full, appId: '  ' })).toBeNull();
    expect(parseFirebaseConfig({})).toBeNull();
  });
  it('테스트 환경에는 환경변수가 없어 미설정', () => {
    expect(isFirebaseConfigured()).toBe(false);
  });
});

describe('safeNextPath', () => {
  it('같은 사이트 경로만 허용', () => {
    expect(safeNextPath('/editor/abc')).toBe('/editor/abc');
    expect(safeNextPath('https://evil.example')).toBe('/settings');
    expect(safeNextPath('//evil.example')).toBe('/settings');
    expect(safeNextPath('/\\evil.example')).toBe('/settings');
    expect(safeNextPath('/login?next=/x')).toBe('/settings');
    expect(safeNextPath(null, '/')).toBe('/');
  });
});
