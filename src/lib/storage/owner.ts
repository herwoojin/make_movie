// 이 브라우저에 저장된 작업(프로젝트·저장 결과·내 목소리 녹음)의 주인.
// 영상·자막은 인터넷에 올라가지 않고 이 브라우저 안에만 저장된다. 그래서 같은 컴퓨터를 쓰는 다른 사람이나
// 로그아웃한 상태에서 내 작업이 보이지 않도록, 로그인한 계정별로 나눠서 보여 준다.
// (화면에서 가리는 것이다 — 이 컴퓨터의 브라우저 저장소 자체를 암호화하지는 않는다)
import { subscribeAuth } from '@/lib/firebase/auth';
import { isFirebaseConfigured } from '@/lib/firebase/config';
import { settings } from '@/lib/settings';

/** 로그인하지 않고 만든 작업 — 로그아웃 상태에서만 보인다 */
export const GUEST = 'guest';
/** 계정별로 나누기 전에 만든 작업 — 이 브라우저에서 로그인한 계정이 가져간다. 로그아웃 상태에서는 보이지 않는다 */
export const LEGACY = 'legacy';

let current: string | null = null;
let resolveFirst: ((owner: string) => void) | null = null;
let ready: Promise<string> = new Promise((resolve) => { resolveFirst = resolve; });
let started = false;

/** 로그인 계정이 바뀌면(로그인·로그아웃) 화면에 남은 이전 계정의 작업을 지우려고 페이지를 새로 연다 */
function onSwitch(next: string): void {
  settings.setLastProjectId('');
  if (location.pathname.startsWith('/login')) return; // 로그인 화면은 스스로 다음 화면으로 넘어간다
  if (next === GUEST) location.replace('/');
  else location.reload();
}

function start(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  subscribeAuth((user) => {
    const next = user?.uid ?? GUEST;
    const previous = current;
    const settled = (async () => {
      // 처음 로그인하면 계정별로 나누기 전의 작업을 이 계정으로 가져온다
      if (next !== GUEST) await claimRows(LEGACY, next).catch(() => undefined);
      current = next;
      return next;
    })();
    ready = settled;
    void settled.then((owner) => {
      resolveFirst?.(owner);
      resolveFirst = null;
      if (previous !== null && previous !== owner) onSwitch(owner);
    });
  });
}

/** 지금 주인 (로그인 상태가 복원될 때까지 기다린다). 로그인했으면 uid, 아니면 GUEST */
export function ownerReady(): Promise<string> {
  // Firebase가 없는 환경(설정 전 개발 등)은 계정이 없으므로 기다리지 않는다
  if (!isFirebaseConfigured() && !started) return Promise.resolve(GUEST);
  start();
  return ready;
}

/** 새 레코드에 붙일 주인 — 아직 모르면 GUEST (만드는 쪽은 가능하면 ownerReady를 먼저 기다린다) */
export function currentOwnerSync(): string {
  return current ?? GUEST;
}

/** 이 주인에게 보여도 되는 레코드인가. Firebase가 없으면 계정 구분이 없으므로 모두 보인다 */
export function isVisible(ownerUid: string | undefined, owner: string): boolean {
  if (!isFirebaseConfigured()) return true;
  return (ownerUid ?? LEGACY) === owner;
}

/** from 주인의 작업을 to 계정으로 옮긴다 (프로젝트·저장 결과·내 목소리). 옮긴 프로젝트 수 */
export async function claimRows(from: string, to: string): Promise<number> {
  const { getDb } = await import('./db');
  const db = getDb();
  return db.transaction('rw', [db.projects, db.savedResults, db.voiceProfiles], async () => {
    const moved = await db.projects.where('ownerUid').equals(from).modify({ ownerUid: to });
    await db.savedResults.where('ownerUid').equals(from).modify({ ownerUid: to });
    await db.voiceProfiles.where('ownerUid').equals(from).modify({ ownerUid: to });
    return moved;
  });
}

/** 주인별 프로젝트 수 (안내 문구용) */
export async function countProjects(owner: string): Promise<number> {
  const { getDb } = await import('./db');
  return getDb().projects.where('ownerUid').equals(owner).count();
}

/** 테스트 전용 — 로그인 상태를 흉내 낸다 */
export function setOwnerForTests(owner: string): void {
  started = true;
  current = owner;
  resolveFirst = null;
  ready = Promise.resolve(owner);
}
