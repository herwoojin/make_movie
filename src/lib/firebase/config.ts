// Firebase 웹 설정. 이 값들은 비밀번호가 아니라 공개 식별자이고, 데이터 보호는 firestore.rules가 담당한다.
// Next.js는 process.env.NEXT_PUBLIC_* 를 "글자 그대로" 쓴 곳만 빌드 시 치환하므로 변수 이름을 하나씩 적는다.

export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
}

export const LOGIN_PATH = '/login';

export function parseFirebaseConfig(raw: Record<string, string | undefined>): FirebaseWebConfig | null {
  const pick = (k: string) => (raw[k] ?? '').trim();
  const config = {
    apiKey: pick('apiKey'),
    authDomain: pick('authDomain'),
    projectId: pick('projectId'),
    appId: pick('appId'),
  };
  if (!config.apiKey || !config.authDomain || !config.projectId || !config.appId) return null;
  return {
    ...config,
    ...(pick('storageBucket') ? { storageBucket: pick('storageBucket') } : {}),
    ...(pick('messagingSenderId') ? { messagingSenderId: pick('messagingSenderId') } : {}),
  };
}

export const firebaseConfig = parseFirebaseConfig({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
});

/** 로컬 에뮬레이터(firebase emulators:start)에 붙을지 */
export const useFirebaseEmulator = process.env.NEXT_PUBLIC_FIREBASE_USE_EMULATOR === '1';

export function isFirebaseConfigured(): boolean {
  return firebaseConfig !== null;
}

/** 로그인 후 돌아갈 주소. 외부 주소로 튕겨 보내는 오픈 리다이렉트를 막기 위해 같은 사이트의 경로만 허용 */
export function safeNextPath(next: string | null | undefined, fallback = '/settings'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\') || next.startsWith(LOGIN_PATH)) return fallback;
  return next;
}
