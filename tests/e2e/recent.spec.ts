import { expect, test } from '@playwright/test';
import { collectErrors, exportWith, FIXTURES, importVideo } from './helpers';

test('내보낸 결과가 최근 저장 결과에 쌓이고, 다시 받기·다시 편집이 된다', async ({ page }) => {
  const errors = collectErrors(page);
  await importVideo(page, FIXTURES.silence);
  const projectId = new URL(page.url()).pathname.split('/').pop()!;

  await exportWith(page, /유튜브 720p/);
  await expect(page.getByText(/저장 완료 ·/)).toBeVisible({ timeout: 30_000 });

  await page.goto('/recent');
  const card = page.getByRole('listitem').filter({ hasText: 'silence-test_편집ON.mp4' }).first();
  await expect(card).toBeVisible();
  await expect(card.getByText('음성 자동편집')).toBeVisible();

  const downloading = page.waitForEvent('download');
  await card.getByRole('button', { name: /다시 받기/ }).click();
  expect((await downloading).suggestedFilename()).toBe('silence-test_편집ON.mp4');

  await card.getByRole('link', { name: /다시 편집/ }).click();
  await page.waitForURL(new RegExp(`/editor/${projectId}`));

  // 삭제하면 목록에서 사라진다
  await page.goto('/recent');
  await page.getByRole('button', { name: /silence-test_편집ON\.mp4 삭제/ }).first().click();
  await expect(page.getByRole('listitem').filter({ hasText: 'silence-test_편집ON.mp4' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('상태 바가 준비 완료 → 처리 중 → 저장 완료로 바뀐다', async ({ page }) => {
  await page.goto('/');
  const bar = page.getByRole('status').filter({ hasText: /준비 완료|처리 중|저장 완료/ }).first();
  await expect(bar).toContainText('준비 완료');
});
