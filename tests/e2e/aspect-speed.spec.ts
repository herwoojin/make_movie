import { expect, test } from '@playwright/test';
import { collectErrors, exportWith, ffprobe, FIXTURES, importVideo, openPanel } from './helpers';

test('화면 비율 9:16(블러 배경)으로 바꾸면 내보낸 영상도 세로가 된다', async ({ page }) => {
  const errors = collectErrors(page);
  await importVideo(page, FIXTURES.silence);

  await openPanel(page, '꾸미기');
  await page.getByRole('radiogroup', { name: '화면 비율' }).first().getByRole('radio', { name: '유튜브 16:9' }).click();
  await page.getByRole('radiogroup', { name: '화면 비율' }).first().getByRole('radio', { name: '쇼츠 9:16' }).click();
  await expect(page.getByRole('radiogroup', { name: '남는 자리 채우기' }).first().getByRole('radio', { name: '블러 배경' })).toHaveAttribute('aria-checked', 'true');

  const { file } = await exportWith(page, /유튜브 720p/);
  const info = ffprobe(file);
  // 원본(가로 640×360)보다 키우지 않으므로 긴 변을 유지한 세로 9:16이 된다
  expect((info.video?.width ?? 0) / (info.video?.height ?? 1)).toBeCloseTo(9 / 16, 2);
  expect(info.video?.height).toBeGreaterThan(info.video?.width ?? 0);
  expect(errors).toEqual([]);
});

test('음정 유지 배속 + 블러 배경은 예비 인코더(ffmpeg atempo·boxblur)로 처리된다', async ({ page }) => {
  const errors = collectErrors(page);
  await importVideo(page, FIXTURES.silence);

  await openPanel(page, '꾸미기');
  await page.getByRole('radiogroup', { name: '화면 비율' }).first().getByRole('radio', { name: '쇼츠 9:16' }).click();
  await page.getByRole('tab', { name: '배속' }).click();
  await page.getByRole('button', { name: '1.5×' }).click();

  const { file } = await exportWith(page, /유튜브 720p/);
  const info = ffprobe(file);
  expect(Math.abs(info.duration - 5 / 1.5)).toBeLessThan(0.25);
  expect((info.video?.width ?? 0) / (info.video?.height ?? 1)).toBeCloseTo(9 / 16, 2);
  expect(errors).toEqual([]);
});

test('전체 배속 2배(음정 유지 끔)로 내보내면 길이가 절반이 된다', async ({ page }) => {
  const errors = collectErrors(page);
  await importVideo(page, FIXTURES.silence); // 5초 고정 길이 픽스처

  await openPanel(page, '꾸미기');
  await page.getByRole('tab', { name: '배속' }).click();
  await page.getByRole('switch', { name: '음정 유지' }).click(); // 끄면 WebCodecs 경로로 빠르게 처리된다
  await page.getByRole('button', { name: '2×' }).click();
  await expect(page.getByText(/결과 길이는 2\.5초/)).toBeVisible();

  const { file } = await exportWith(page, /유튜브 720p/);
  const info = ffprobe(file);
  expect(Math.abs(info.duration - 2.5)).toBeLessThan(0.2);
  expect(Math.abs((info.video?.duration ?? 0) - (info.audio?.duration ?? 0))).toBeLessThan(0.15);
  expect(errors).toEqual([]);
});
