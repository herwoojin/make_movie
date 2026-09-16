import { describe, expect, it } from 'vitest';
import { firebaseErrorCode, mapAuthError, mapFirestoreError } from './errors';

describe('Firebase 오류 매핑', () => {
  it('코드 추출', () => {
    expect(firebaseErrorCode({ code: 'auth/popup-blocked' })).toBe('auth/popup-blocked');
    expect(firebaseErrorCode(new Error('x'))).toBe('');
  });

  it('사용자가 창을 닫으면 조용히 취소', () => {
    expect(mapAuthError({ code: 'auth/popup-closed-by-user' }).code).toBe('ABORTED');
  });

  it('모든 오류에 다음 행동(hint)이 있다', () => {
    for (const code of ['auth/popup-blocked', 'auth/unauthorized-domain', 'auth/operation-not-allowed', 'auth/network-request-failed', 'auth/invalid-api-key', 'auth/weird']) {
      const err = mapAuthError({ code });
      expect(err.code).toBe('AUTH_FAILED');
      expect(err.hint.length).toBeGreaterThan(5);
    }
    expect(mapAuthError({ code: 'auth/unauthorized-domain' }).hint).toContain('승인된 도메인');
    for (const code of ['permission-denied', 'unavailable', 'failed-precondition', 'other']) {
      expect(mapFirestoreError({ code }).hint.length).toBeGreaterThan(5);
    }
    expect(mapFirestoreError({ code: 'permission-denied' }).hint).toContain('firestore.rules');
    expect(mapFirestoreError({ code: 'unauthenticated' }).code).toBe('AUTH_REQUIRED');
  });
});
