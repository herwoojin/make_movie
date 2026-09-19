import { expect, test, type Page } from '@playwright/test';
import { collectErrors, FIXTURES, importVideoStageOne } from './helpers';

/** 같은 브라우저에 다른 사람의 작업이 있는 상황을 만든다 — 방금 만든 프로젝트를 복사해 주인만 바꾼다 */
async function addProjectCopies(page: Page, fromId: string, copies: { id: string; name: string; ownerUid: string }[]) {
  await page.evaluate(async ({ fromId: from, copies: list }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open('editon');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('projects', 'readwrite');
    const store = tx.objectStore('projects');
    const base = await new Promise<Record<string, unknown>>((resolve) => {
      const get = store.get(from);
      get.onsuccess = () => resolve(get.result as Record<string, unknown>);
    });
    for (const c of list) store.put({ ...base, ...c, updatedAt: Date.now() });
    await new Promise((resolve) => { tx.oncomplete = resolve; });
    db.close();
  }, { fromId, copies });
}

test('로그아웃 상태: 다른 계정의 작업과 로그인해야 보이는 작업은 목록에도, 주소로도 보이지 않는다', async ({ page }) => {
  const errors = collectErrors(page);
  const mine = await importVideoStageOne(page, FIXTURES.silence); // 로그인하지 않고 만든 작업
  await addProjectCopies(page, mine, [
    { id: 'p-other-account', name: 'OTHER-ACCOUNT-WORK', ownerUid: 'someone-else-uid' },
    { id: 'p-before-split', name: 'BEFORE-SPLIT-WORK', ownerUid: 'legacy' },
  ]);

  // 첫 화면 "이어서 편집하기"
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '이어서 편집하기' })).toBeVisible();
  await expect(page.getByText('이전에 만든 작업 1개는 로그인한 계정에서만 보입니다.')).toBeVisible();
  await expect(page.getByText('OTHER-ACCOUNT-WORK')).toHaveCount(0);
  await expect(page.getByText('BEFORE-SPLIT-WORK')).toHaveCount(0);

  // 내 프로젝트
  await page.goto('/projects');
  await expect(page.getByText('로그인하지 않고 만든 작업은 이 브라우저를 쓰는 누구나 볼 수 있습니다', { exact: false }).or(page.getByText('이전에 만든 작업 1개는'))).toBeVisible();
  await expect(page.getByText('OTHER-ACCOUNT-WORK')).toHaveCount(0);
  await expect(page.getByText('BEFORE-SPLIT-WORK')).toHaveCount(0);

  // 주소를 직접 넣어도 열리지 않는다
  await page.goto('/editor/p-other-account');
  await expect(page.getByText('지금 계정에서는 열 수 없는 프로젝트입니다').first()).toBeVisible({ timeout: 30_000 });
  await page.goto('/editor/p-before-split');
  await expect(page.getByText('지금 계정에서는 열 수 없는 프로젝트입니다').first()).toBeVisible({ timeout: 30_000 });

  // 내가 로그인하지 않고 만든 작업은 그대로 열린다
  await page.goto(`/editor/${mine}`);
  await expect(page.getByRole('button', { name: /무음 찾기|다시 찾기/ })).toBeVisible({ timeout: 60_000 });
  expect(errors).toEqual([]);
});
