import { expect, test } from '@playwright/test';
import { collectErrors, ffprobe, FIXTURES } from './helpers';

test.describe('도구함', () => {
  test('오디오 추출: 구간 WAV', async ({ page }) => {
    await page.goto('/tools/audio');
    await page.locator('input[type=file][accept="video/*,audio/*"]').setInputFiles(FIXTURES.silence);
    await expect(page.getByText(/silence-test\.mp4 \(0:05\.0\)/)).toBeVisible();
    await page.locator('#ae-start').fill('0:01.0');
    await page.locator('#ae-end').fill('0:03.0');
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: /추출해서 저장/ }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('silence-test.wav');
    const info = ffprobe(await download.path());
    expect(Math.abs(info.duration - 2)).toBeLessThan(0.05);
  });

  test('오디오 추출: MP3 (예비 인코더)', async ({ page }) => {
    await page.goto('/tools/audio');
    await page.locator('input[type=file][accept="video/*,audio/*"]').setInputFiles(FIXTURES.silence);
    await expect(page.getByText(/silence-test\.mp4/)).toBeVisible();
    await page.locator('#ae-start').fill('0:01.0');
    await page.locator('#ae-end').fill('0:03.0');
    await page.getByRole('radio', { name: /MP3/ }).click();
    const downloading = page.waitForEvent('download', { timeout: 90_000 });
    await page.getByRole('button', { name: /추출해서 저장/ }).click();
    const info = ffprobe(await (await downloading).path());
    expect(info.streams[0].codec_name).toBe('mp3');
    expect(Math.abs(info.duration - 2)).toBeLessThan(0.15);
  });

  test('이미지 편집: 90° 회전 후 JPG 저장', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/tools/image');
    await page.locator('input[type=file][accept="image/*"]').setInputFiles(FIXTURES.image);
    await expect(page.getByText(/400×300/)).toBeVisible();
    await page.getByRole('button', { name: /90° 회전/ }).click();
    await expect(page.getByText(/300×400/)).toBeVisible();
    const downloading = page.waitForEvent('download');
    await page.getByRole('button', { name: /^저장/ }).click();
    const download = await downloading;
    expect(download.suggestedFilename()).toBe('image-400x300_편집ON.jpg');
    const info = ffprobe(await download.path());
    expect(info.streams[0]).toMatchObject({ codec_name: 'mjpeg', width: 300, height: 400 });
    expect(errors).toEqual([]);
  });

  test('도구함 → 편집기로 보내기', async ({ page }) => {
    await page.goto('/tools/gif');
    await page.locator('input[type=file][accept="video/*"]').first().setInputFiles(FIXTURES.silence);
    await page.getByRole('button', { name: /편집기로 보내기/ }).click();
    await page.waitForURL(/\/editor\//, { timeout: 60_000 });
  });
});

test('랜딩: 샘플 영상으로 체험 → 편집기', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /샘플 영상으로 30초 체험/ }).click();
  await page.waitForURL(/\/auto-edit\?project=/, { timeout: 60_000 });
  await expect(page.getByRole('heading', { name: '편집ON 샘플' })).toBeVisible();
});
