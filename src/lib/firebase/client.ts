// Firebase 지연 초기화. 로그인·동기화를 실제로 쓸 때만 SDK(수백 KB)를 내려받는다.
import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { firebaseConfig, useFirebaseEmulator } from './config';

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

let services: Promise<FirebaseServices | null> | null = null;

export function getFirebase(): Promise<FirebaseServices | null> {
  const config = firebaseConfig;
  if (typeof window === 'undefined' || !config) return Promise.resolve(null);
  services ??= (async () => {
    const [appMod, authMod, storeMod] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
    const app = appMod.getApps()[0] ?? appMod.initializeApp(config);
    let auth: Auth;
    try {
      // 팝업·리다이렉트 처리기(browserPopupRedirectResolver)는 기본으로 넣지 않는다.
      // 넣으면 페이지를 열 때마다 authDomain의 iframe을 띄우는데, cross-origin isolation(COEP) 페이지에서는 막힌다.
      // 로그인 팝업은 격리 헤더가 없는 /login 페이지에서만 처리기를 직접 넘겨 연다.
      auth = authMod.initializeAuth(app, { persistence: [authMod.indexedDBLocalPersistence, authMod.browserLocalPersistence] });
    } catch {
      // 개발 중 핫 리로드로 이미 초기화된 경우
      auth = authMod.getAuth(app);
    }
    const db = storeMod.getFirestore(app);
    if (useFirebaseEmulator) {
      authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
      storeMod.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    }
    return { app, auth, db };
  })().catch((e) => {
    services = null;
    throw e;
  });
  return services;
}
