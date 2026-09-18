import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { collectErrors, FIXTURES, openPanel } from './helpers';

const SRT = path.resolve(__dirname, '../fixtures/sample.srt'); // 0.2~1.6초, 2.0~3.4초

test('자막 먼저 보여주기: 고르면 자막 파일에도 반영되고, 새로고침해도 남는다', async ({ page }) => {
  const errors = collectErrors(page);

  // 영상 + SRT로 시작 (자막 2줄)
  await page.goto('/editor');
  await page.getByRole('button', { name: /영상 \+ SRT 열기/ }).click();
  await page.locator('input[type=file][accept*="video"]').setInputFiles(FIXTURES.silence);
  await page.locator('input[type=file][accept*="srt"]').setInputFiles(SRT);
  await page.getByRole('button', { name: '시작하기' }).click();
  await page.waitForURL(/\/editor\/[^/]+$/, { timeout: 60_000 });
  await expect(page.getByText('2개 자막 클립').first()).toBeVisible({ timeout: 30_000 });

  await openPanel(page, '자막');
  const off = page.getByRole('radio', { name: '끄기' });
  await expect(off).toHaveAttribute('aria-checked', 'true'); // 기본은 끔 — 기존 프로젝트 동작이 바뀌지 않게

  await page.getByRole('radio', { name: /0\.3초/ }).click();
  await expect(page.getByText(/자막이 말보다 0\.30초 먼저 나타납니다/)).toBeVisible();

  // 자막 파일에 그대로 반영: 첫 줄은 0초에서 멈추고, 둘째 줄은 앞 자막이 끝난 1.6초보다 앞서지 않는다
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: /SRT 받기/ }).click();
  const srt = readFileSync(await (await downloading).path(), 'utf8');
  expect(srt).toContain('00:00:00,000 --> 00:00:01,600');
  expect(srt).toContain('00:00:01,700 --> 00:00:03,400');

  // 설정은 프로젝트에 저장된다
  await expect(page.getByText(/자동 저장됨/).first()).toBeVisible({ timeout: 10_000 });
  await page.reload();
  await openPanel(page, '자막');
  await expect(page.getByRole('radio', { name: /0\.3초/ })).toHaveAttribute('aria-checked', 'true');

  // 끄면 원래 시각으로 돌아온다
  await page.getByRole('radio', { name: '끄기' }).click();
  const again = page.waitForEvent('download');
  await page.getByRole('button', { name: /SRT 받기/ }).click();
  const plain = readFileSync(await (await again).path(), 'utf8');
  expect(plain).toContain('00:00:00,200 --> 00:00:01,600');
  expect(plain).toContain('00:00:02,000 --> 00:00:03,400');

  expect(errors).toEqual([]);
});
