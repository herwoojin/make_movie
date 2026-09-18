import { expect, test } from '@playwright/test';
import { FIXTURES, importVideo, outputSeconds } from './helpers';

test('프로젝트: 만들기 → 목록 → 자막 추가 → 새로고침 후 유지 → 삭제', async ({ page }) => {
  await importVideo(page, FIXTURES.sample);

  await page.getByRole('tab', { name: /자막/ }).click();
  await page.getByRole('button', { name: /재생 위치에 자막 추가/ }).click();
  const textarea = page.getByRole('textbox', { name: /자막 글자/ }).first();
  await textarea.fill('안녕하세요 편집ON 테스트입니다');
  await textarea.blur();
  await expect(page.getByText(/자동 저장됨/)).toBeVisible({ timeout: 10_000 });

  // 새로고침해도 편집이 남아 있다 (IndexedDB + OPFS)
  await page.reload();
  await page.getByRole('tab', { name: /자막/ }).click();
  await expect(page.getByRole('textbox', { name: /자막 글자/ }).first()).toHaveValue('안녕하세요 편집ON 테스트입니다');

  await page.goto('/projects');
  const card = page.getByRole('listitem').filter({ hasText: 'editon-sample' }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /삭제/ }).click();
  await page.getByRole('button', { name: '지우기' }).click();
  await expect(page.getByText(/프로젝트를 지웠습니다/)).toBeVisible();
});

test('프로젝트 파일(.editon.json) 내보내기 → 원본과 함께 불러오면 편집 결정이 그대로', async ({ page }) => {
  await importVideo(page, FIXTURES.silence);
  await page.getByRole('button', { name: /무음 찾기/ }).click();
  await page.getByRole('button', { name: /선택한 2개 적용/ }).click();
  const expected = await outputSeconds(page);
  expect(expected).toBeLessThan(5);
  await expect(page.getByText(/자동 저장됨/)).toBeVisible({ timeout: 10_000 });

  await page.goto('/projects');
  const card = page.getByRole('listitem').filter({ hasText: 'silence-test' }).first();
  const downloading = page.waitForEvent('download');
  await card.getByRole('button', { name: /프로젝트 파일 내보내기/ }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe('silence-test.editon.json');

  await page.getByRole('button', { name: /프로젝트 파일 불러오기/ }).click();
  await page.locator('#editon-json').setInputFiles(await download.path());
  await expect(page.getByText(/원본: silence-test\.mp4/)).toBeVisible();
  await page.locator('#editon-video').setInputFiles(FIXTURES.silence);
  await page.waitForURL(/\/editor\//, { timeout: 60_000 });
  await expect.poll(() => outputSeconds(page)).toBe(expected);
});
