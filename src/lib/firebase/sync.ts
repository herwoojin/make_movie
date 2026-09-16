// Firestore 동기화: 자막 스타일 프리셋 · 추임새 사전 · 프로젝트 기록(이름·길이만).
// 로컬(IndexedDB/localStorage)이 기준이고, 사용자가 버튼을 누를 때만 서버와 맞춘다 — 자동 업로드는 하지 않는다.
import { settings } from '@/lib/settings';
import { getDb } from '@/lib/storage/db';
import { requireUser } from './auth';
import { mapFirestoreError } from './errors';
import {
  decideFillerSync, parseFillerDoc, parseProjectMetaDoc, planPresetSync, presetToDoc, projectToMetaDoc, type ProjectMetaDoc,
} from './schema';

async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AppError') throw e;
    throw mapFirestoreError(e);
  }
}

export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  const os = /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '기타';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '브라우저';
  return `${os} · ${browser}`;
}

export async function syncPresets(): Promise<{ pushed: number; pulled: number }> {
  const { fb, uid } = await requireUser();
  return guard(async () => {
    const { collection, doc, getDocs, setDoc } = await import('firebase/firestore');
    const col = collection(fb.db, 'users', uid, 'stylePresets');
    const snap = await getDocs(col);
    const db = getDb();
    const plan = planPresetSync(await db.stylePresets.toArray(), snap.docs.map((d) => ({ id: d.id, data: d.data() })));
    for (const p of plan.pull) await db.stylePresets.put(p);
    for (const p of plan.push) {
      const ref = p.remoteId ? doc(col, p.remoteId) : doc(col);
      await setDoc(ref, presetToDoc(p));
      await db.stylePresets.put({ ...p, remoteId: ref.id });
    }
    return { pushed: plan.push.length, pulled: plan.pull.length };
  });
}

/** 다른 기기에서 다시 받아오지 않도록 로컬에서 지운 프리셋은 서버 문서도 지운다 (로그인 안 했으면 무시) */
export async function deleteRemotePreset(remoteId: string): Promise<void> {
  const { fb, uid } = await requireUser();
  await guard(async () => {
    const { deleteDoc, doc } = await import('firebase/firestore');
    await deleteDoc(doc(fb.db, 'users', uid, 'stylePresets', remoteId));
  });
}

export async function syncFillers(language = 'ko'): Promise<'pushed' | 'pulled' | 'same'> {
  const { fb, uid } = await requireUser();
  return guard(async () => {
    const { doc, getDoc, setDoc } = await import('firebase/firestore');
    const ref = doc(fb.db, 'users', uid, 'fillerDictionaries', language);
    const remote = parseFillerDoc((await getDoc(ref)).data());
    const decision = decideFillerSync(settings.getFillersUpdatedAt(), remote);
    if (decision === 'pull' && remote) {
      settings.setFillersFromRemote(remote.words, remote.updatedAtMs);
      return 'pulled';
    }
    if (decision === 'push') {
      const updatedAtMs = settings.getFillersUpdatedAt() || Date.now();
      await setDoc(ref, { language, words: settings.getFillers(), updatedAtMs });
      return 'pushed';
    }
    return 'same';
  });
}

export async function pushProjectMeta(): Promise<number> {
  const { fb, uid } = await requireUser();
  return guard(async () => {
    const { doc, setDoc } = await import('firebase/firestore');
    const projects = await getDb().projects.toArray();
    const label = deviceLabel();
    for (const p of projects) await setDoc(doc(fb.db, 'users', uid, 'projectMeta', p.id), projectToMetaDoc(p, label));
    return projects.length;
  });
}

export async function listRemoteProjectMeta(): Promise<ProjectMetaDoc[]> {
  const { fb, uid } = await requireUser();
  return guard(async () => {
    const { collection, getDocs } = await import('firebase/firestore');
    const snap = await getDocs(collection(fb.db, 'users', uid, 'projectMeta'));
    return snap.docs
      .map((d) => parseProjectMetaDoc(d.data()))
      .filter((d): d is ProjectMetaDoc => d !== null)
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs);
  });
}
