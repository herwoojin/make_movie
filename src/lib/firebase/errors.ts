// Firebase 오류 코드 → 사용자가 다음에 할 일(hint)이 있는 AppError
import { AppError } from '@/lib/errors';

export function firebaseErrorCode(e: unknown): string {
  return typeof e === 'object' && e !== null && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : '';
}

export function mapAuthError(e: unknown): AppError {
  switch (firebaseErrorCode(e)) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return new AppError('ABORTED');
    case 'auth/popup-blocked':
      return new AppError('AUTH_FAILED', '로그인 창이 팝업 차단에 막혔습니다.', '주소창 오른쪽의 팝업 차단 아이콘을 눌러 이 사이트를 허용한 뒤 다시 눌러 주세요.');
    case 'auth/unauthorized-domain':
      return new AppError('AUTH_FAILED', '이 주소에서는 로그인이 허용되지 않았습니다.', 'Firebase 콘솔 > Authentication > 설정 > 승인된 도메인에 이 사이트 주소(예: xxx.netlify.app)를 추가해 주세요.');
    case 'auth/operation-not-allowed':
      return new AppError('AUTH_FAILED', 'Google 로그인이 꺼져 있습니다.', 'Firebase 콘솔 > Authentication > 로그인 방법에서 Google을 사용 설정해 주세요.');
    case 'auth/network-request-failed':
      return new AppError('AUTH_FAILED', '로그인 서버에 연결하지 못했습니다.', '인터넷 연결을 확인하고 다시 시도해 주세요.');
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
    case 'auth/api-key-not-valid.-please-pass-a-valid-api-key.':
      return new AppError('AUTH_FAILED', 'Firebase 설정 값이 올바르지 않습니다.', 'NEXT_PUBLIC_FIREBASE_* 환경변수(로컬 .env.local, Netlify 사이트 설정)를 다시 확인해 주세요.');
    default:
      return new AppError('AUTH_FAILED', `로그인하지 못했습니다. (${firebaseErrorCode(e) || '원인 불명'})`, '잠시 후 다시 시도해 주세요. 로그인하지 않아도 모든 편집 기능은 쓸 수 있습니다.');
  }
}

export function mapFirestoreError(e: unknown): AppError {
  switch (firebaseErrorCode(e)) {
    case 'permission-denied':
      return new AppError('SYNC_FAILED', '동기화 권한이 없습니다.', 'Firebase에 firestore.rules가 배포되었는지 확인해 주세요 (firebase deploy --only firestore).');
    case 'unauthenticated':
      return new AppError('AUTH_REQUIRED');
    case 'unavailable':
    case 'deadline-exceeded':
      return new AppError('SYNC_FAILED', '동기화 서버에 연결하지 못했습니다.', '인터넷 연결을 확인하고 다시 시도해 주세요.');
    case 'failed-precondition':
      return new AppError('SYNC_FAILED', 'Firestore 데이터베이스가 준비되지 않았습니다.', 'Firebase 콘솔 > Firestore Database에서 데이터베이스를 먼저 만들어 주세요.');
    default:
      return new AppError('SYNC_FAILED', `동기화하지 못했습니다. (${firebaseErrorCode(e) || '원인 불명'})`, '잠시 후 다시 시도해 주세요. 데이터는 이 브라우저에 그대로 남아 있습니다.');
  }
}
