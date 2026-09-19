import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/types/models';
import { DEFAULT_PROJECT_VIEW } from '@/types/editor';

// 계정 구분은 Firebase가 설정된 배포 환경에서만 켜진다 — 테스트에서는 켜진 것으로 친다
vi.mock('@/lib/firebase/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/firebase/config')>()),
  isFirebaseConfigured: () => true,
}));

const { EditOnDB, getDb } = await import('./db');
const { claimRows, GUEST, isVisible, LEGACY, setOwnerForTests } = await import('./owner');
const { listProjects, loadProjectBundle } = await import('./projectRepo');

const project = (id: string, ownerUid?: string): Project => ({
  id, name: id, durationMs: 1000, sourceDurationMs: 1000, width: 640, height: 360, fps: 30,
  status: 'editing', createdAt: 0, updatedAt: Number(id.replace(/\D/g, '')) || 0, schemaVersion: 2,
  ...DEFAULT_PROJECT_VIEW, pipelineStage: 1, sourceTool: 'import', ownerUid,
});

beforeEach(async () => {
  const db = getDb();
  await Promise.all([db.projects.clear(), db.savedResults.clear(), db.voiceProfiles.clear()]);
  await db.projects.bulkAdd([project('mine1', 'u1'), project('other2', 'u2'), project('guest3', GUEST), project('old4', LEGACY)]);
});

afterEach(() => setOwnerForTests(GUEST));

describe('계정별로 나눠 보여 주기', () => {
  it('로그인한 계정은 자기 작업만 본다', async () => {
    setOwnerForTests('u1');
    expect((await listProjects()).map((p) => p.id)).toEqual(['mine1']);
  });

  it('로그아웃하면 내 작업도, 계정을 나누기 전 작업도 보이지 않는다 (로그인하지 않고 만든 것만)', async () => {
    setOwnerForTests(GUEST);
    expect((await listProjects()).map((p) => p.id)).toEqual(['guest3']);
  });

  it('주소를 직접 넣어도 다른 계정의 프로젝트는 열리지 않는다', async () => {
    setOwnerForTests('u1');
    await expect(loadProjectBundle('other2')).rejects.toMatchObject({ code: 'NOT_FOUND', message: expect.stringContaining('열 수 없는 프로젝트') });
    setOwnerForTests(GUEST);
    await expect(loadProjectBundle('mine1')).rejects.toMatchObject({ message: expect.stringContaining('열 수 없는 프로젝트') });
  });

  it('처음 로그인한 계정이 계정을 나누기 전 작업을 가져간다', async () => {
    expect(await claimRows(LEGACY, 'u1')).toBe(1);
    setOwnerForTests('u1');
    expect((await listProjects()).map((p) => p.id).sort()).toEqual(['mine1', 'old4']);
    setOwnerForTests('u2');
    expect((await listProjects()).map((p) => p.id)).toEqual(['other2']);
  });

  it('주인을 적지 않고 만들어도 지금 계정이 주인이 된다', async () => {
    setOwnerForTests('u1');
    await getDb().projects.add(project('new5'));
    expect((await getDb().projects.get('new5'))?.ownerUid).toBe('u1');
  });

  it('주인이 없는 기록은 계정을 나누기 전 작업으로 본다', () => {
    expect(isVisible(undefined, GUEST)).toBe(false);
    expect(isVisible(undefined, LEGACY)).toBe(true);
  });
});

describe('DB 업그레이드 (v3 → v4)', () => {
  it('이미 저장돼 있던 작업은 주인을 모르므로 legacy가 된다', async () => {
    const name = 'editon-upgrade-test';
    const old = new Dexie(name);
    old.version(3).stores({ projects: 'id, updatedAt, status', savedResults: 'id, createdAt, kind, toolId', voiceProfiles: 'id, emotion, updatedAt' });
    await old.table('projects').add(project('before'));
    await old.table('savedResults').add({ id: 'sr1', createdAt: 1, kind: 'video', toolId: 't' });
    old.close();

    const db = new EditOnDB(name);
    expect((await db.projects.get('before'))?.ownerUid).toBe(LEGACY);
    expect((await db.savedResults.get('sr1'))?.ownerUid).toBe(LEGACY);
    await db.delete();
  });
});
