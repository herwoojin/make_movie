// Google 로그인 (Firebase Auth). 로그인하지 않아도 모든 편집 기능은 동작한다 — 로그인은 동기화용 선택 기능.
import type { User } from 'firebase/auth';
import { AppError } from '@/lib/errors';
import { getFirebase, type FirebaseServices } from './client';
import { mapAuthError } from './errors';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

function toAuthUser(u: User): AuthUser {
  return { uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL };
}

/** 로그인 상태 구독. Firebase가 설정되지 않았으면 곧바로 null을 알린다 */
export function subscribeAuth(cb: (user: AuthUser | null) => void): () => void {
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;
  getFirebase()
    .then(async (fb) => {
      if (cancelled) return;
      if (!fb) { cb(null); return; }
      const { onAuthStateChanged } = await import('firebase/auth');
      if (cancelled) return;
      unsubscribe = onAuthStateChanged(fb.auth, (u) => cb(u ? toAuthUser(u) : null), () => cb(null));
    })
    .catch(() => { if (!cancelled) cb(null); });
  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

/** 프로필 문서. 규칙이 아직 배포되지 않았어도 로그인 자체는 성공하도록 실패를 삼킨다 */
async function upsertProfile(fb: FirebaseServices, user: User): Promise<void> {
  try {
    const { doc, getDoc, serverTimestamp, setDoc } = await import('firebase/firestore');
    const ref = doc(fb.db, 'users', user.uid);
    const exists = (await getDoc(ref)).exists();
    await setDoc(ref, {
      displayName: user.displayName ?? null,
      email: user.email ?? null,
      photoURL: user.photoURL ?? null,
      lastLoginAt: serverTimestamp(),
      ...(exists ? {} : { createdAt: serverTimestamp() }),
    }, { merge: true });
  } catch (e) {
    console.warn('[firebase] 프로필 저장 실패 (firestore.rules 배포 여부 확인)', e);
  }
}

export async function signInWithGoogle(): Promise<AuthUser> {
  if (self.crossOriginIsolated) {
    // COOP same-origin 문서에서는 팝업과 통신이 끊겨 로그인이 끝나지 않는다
    throw new AppError('AUTH_FAILED', '이 화면에서는 로그인 창을 열 수 없습니다.', '로그인 페이지를 새로고침한 뒤 다시 눌러 주세요.');
  }
  const fb = await getFirebase();
  if (!fb) throw new AppError('AUTH_FAILED', '이 사이트에는 Firebase가 설정되지 않았습니다.', '로그인 없이도 모든 편집 기능을 쓸 수 있습니다.');
  const { GoogleAuthProvider, browserPopupRedirectResolver, signInWithPopup } = await import('firebase/auth');
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(fb.auth, provider, browserPopupRedirectResolver);
    await upsertProfile(fb, cred.user);
    return toAuthUser(cred.user);
  } catch (e) {
    throw mapAuthError(e);
  }
}

export async function signOutUser(): Promise<void> {
  const fb = await getFirebase();
  if (!fb) return;
  const { signOut } = await import('firebase/auth');
  await signOut(fb.auth);
}

/** 동기화 직전: 로그인 상태가 복원될 때까지 기다린 뒤 사용자 확인 */
export async function requireUser(): Promise<{ fb: FirebaseServices; uid: string }> {
  const fb = await getFirebase();
  if (!fb) throw new AppError('SYNC_FAILED', '이 사이트에는 Firebase가 설정되지 않았습니다.', '동기화 없이도 데이터는 이 브라우저에 저장됩니다.');
  await fb.auth.authStateReady();
  const user = fb.auth.currentUser;
  if (!user) throw new AppError('AUTH_REQUIRED');
  return { fb, uid: user.uid };
}
