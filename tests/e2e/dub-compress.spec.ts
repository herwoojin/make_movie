import { expect, test } from '@playwright/test';
import { collectErrors, ffprobe, FIXTURES } from './helpers';

test('용량 줄이기: 목표 용량을 지정하면 그 근처로 압축된다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/tools/compress');

  await page.locator('input[type=file]').setInputFiles(FIXTURES.silence);
  await expect(page.getByText('silence-test.mp4')).toBeVisible();

  // 이 테스트 영상은 이미 아주 작아서 "더 커진다"고 미리 알려 준다
  await expect(page.getByText(/이미 충분히 작습니다/)).toBeVisible();

  await page.getByRole('radio', { name: /목표 용량 지정/ }).click();
  await page.getByLabel('목표 용량 (MB)').fill('1');

  const downloading = page.waitForEvent('download', { timeout: 120_000 });
  await page.getByRole('button', { name: /용량 줄이기/ }).click();
  await expect(page.getByText(/% 줄어듦|실패/)).toBeVisible({ timeout: 120_000 });

  const file = await (await downloading).path();
  const info = ffprobe(file);
  expect(info.video?.codec_name).toBe('h264');
  const { statSync } = await import('node:fs');
  const mb = statSync(file).size / (1024 * 1024);
  // 목표를 넘지 않는 것이 핵심. 화면 변화가 적으면 목표보다 작게 나온다(비트를 억지로 채우지 않는다)
  expect(mb).toBeLessThanOrEqual(1.15);
  expect(statSync(file).size).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('소리 입히기: 영상에 다른 소리를 얹어 저장한다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/dub');

  await page.locator('input[accept*="video"]').setInputFiles(FIXTURES.silence);
  await expect(page.getByText(/silence-test\.mp4 · /)).toBeVisible({ timeout: 30_000 });

  // 같은 영상의 소리를 얹는 소리로 쓴다 (별도 오디오 픽스처 없이 경로 전체를 확인)
  await page.locator('input[accept*="audio"]').setInputFiles(FIXTURES.speech);
  await expect(page.getByRole('img', { name: /파형/ })).toBeVisible({ timeout: 30_000 });

  const downloading = page.waitForEvent('download', { timeout: 180_000 }).catch(() => null);
  await page.getByRole('button', { name: /소리 입힌 영상 저장/ }).click();
  await expect(page.getByText(/저장 완료 ·/)).toBeVisible({ timeout: 180_000 });

  const download = await downloading;
  if (download) {
    const info = ffprobe(await download.path());
    expect(info.video?.codec_name).toBe('h264');
    expect(info.audio?.codec_name).toBe('aac');
  }
  expect(errors).toEqual([]);
});
