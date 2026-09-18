import path from 'node:path';
import { expect, test } from '@playwright/test';
import { collectErrors, FIXTURES, importVideoStageOne, outputSeconds } from './helpers';

const SRT = path.resolve(__dirname, '../fixtures/sample.srt');

test('1단계에서 자동편집 → 2단계로 보내기 (재인코딩 없이 바로 열린다)', async ({ page }) => {
  const errors = collectErrors(page);
  const projectId = await importVideoStageOne(page, FIXTURES.silence);

  await page.getByRole('button', { name: /무음 찾기/ }).click();
  await expect(page.getByRole('list', { name: '자를 제안 목록' }).getByRole('listitem')).toHaveCount(2);
  await page.getByRole('button', { name: /선택한 2개 적용/ }).click();
  await expect.poll(() => outputSeconds(page)).toBeLessThan(5);
  const cutSeconds = await outputSeconds(page);

  const started = Date.now();
  await page.getByRole('button', { name: /2단계로 보내기/ }).click();
  await page.waitForURL(new RegExp(`/editor/${projectId}`), { timeout: 30_000 });
  // 인코딩이 끼면 수십 초가 걸린다 — 결정만 넘기므로 즉시 열려야 한다
  expect(Date.now() - started).toBeLessThan(10_000);

  // 1단계에서 자른 결과가 그대로 이어진다
  await expect.poll(() => outputSeconds(page)).toBe(cutSeconds);
  await expect(page.getByRole('button', { name: /완성 영상 내보내기/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('2단계: 영상 + SRT 열기 → 자막 클립과 단어 칩이 만들어진다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/editor');
  await page.getByRole('button', { name: /영상 \+ SRT 열기/ }).click();
  await page.locator('input[type=file][accept*="video"]').setInputFiles(FIXTURES.silence);
  await page.locator('input[type=file][accept*="srt"]').setInputFiles(SRT);
  await page.getByRole('button', { name: '시작하기' }).click();

  await page.waitForURL(/\/editor\/[^/]+$/, { timeout: 60_000 });
  await expect(page.getByText('2개 자막 클립').first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: '"편집ON" 지우기' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: /자막 글자/ }).first()).toHaveValue('안녕하세요 편집ON 입니다');

  // 단어 칩 하나를 지우면 자막 줄에서도 사라진다
  await page.getByRole('button', { name: '"편집ON" 지우기' }).click();
  await expect(page.getByRole('textbox', { name: /자막 글자/ }).first()).toHaveValue('안녕하세요 입니다');
  await page.getByRole('button', { name: /되돌리기/ }).click();
  await expect(page.getByRole('textbox', { name: /자막 글자/ }).first()).toHaveValue('안녕하세요 편집ON 입니다');
  expect(errors).toEqual([]);
});
