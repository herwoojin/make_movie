import { expect, test } from '@playwright/test';
import { collectErrors, FIXTURES } from './helpers';

// 도우미가 꺼져 있을 때의 동작 — 기본값. 에러 없이 웹 전용으로 굴러가야 한다.
test('도우미가 없어도 아무 에러 없이 편집·도구가 열린다', async ({ page }) => {
  const errors = collectErrors(page);

  await page.goto('/settings');
  await expect(page.getByText('연결되지 않음 (웹 전용 모드)')).toBeVisible({ timeout: 20_000 });

  await page.goto('/tools/youtube');
  await expect(page.getByText('내 컴퓨터 도우미가 필요합니다')).toBeVisible();
  await expect(page.getByRole('button', { name: /받기/ })).toBeDisabled();

  await page.goto('/tts');
  await expect(page.getByText(/내 목소리 복제는 내 컴퓨터 도우미 설치가 필요합니다/)).toBeVisible();
  await expect(page.getByRole('button', { name: /브라우저 기본 음성으로 읽기/ })).toBeVisible();

  await page.goto('/tools/compress');
  await page.locator('input[type=file]').setInputFiles(FIXTURES.silence);
  await expect(page.getByText('silence-test.mp4')).toBeVisible();

  expect(errors).toEqual([]);
});

// 사이드카를 실제로 켜고 도는지 확인 (SIDECAR_E2E=1 일 때만)
test('도우미를 켜면 유튜브 칸과 TTS가 열린다 @sidecar', async ({ page }) => {
  test.skip(!process.env.SIDECAR_E2E, '도우미를 띄운 뒤 SIDECAR_E2E=1 SIDECAR_TOKEN=... 로 실행');
  const token = process.env.SIDECAR_TOKEN ?? '';
  const errors = collectErrors(page);

  await page.goto('/settings');
  await page.getByLabel('연결 토큰').fill(token);
  await page.getByRole('button', { name: /다시 확인/ }).click();
  await expect(page.getByText(/연결됨/)).toBeVisible({ timeout: 20_000 });

  await page.goto('/tools/youtube');
  await expect(page.getByText('내 컴퓨터 도우미가 필요합니다')).toHaveCount(0);
  await page.getByLabel('유튜브 주소').fill('https://www.youtube.com/watch?v=dummy');
  await expect(page.getByRole('button', { name: /받기/ })).toBeEnabled();

  expect(errors).toEqual([]);
});
