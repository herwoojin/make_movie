import { expect, test } from '@playwright/test';
import { collectErrors, exportWith, ffprobe, FIXTURES, importVideo, outputSeconds } from './helpers';

test('임포트 → 무음 감지 → 적용 → 되돌리기 → 다시 적용 → 내보내기 (WebCodecs)', async ({ page }) => {
  const errors = collectErrors(page);
  await importVideo(page, FIXTURES.silence);

  await page.getByRole('button', { name: /무음 찾기/ }).click();
  const list = page.getByRole('list', { name: '자를 제안 목록' });
  await expect(list.getByRole('listitem')).toHaveCount(2);

  await page.getByRole('button', { name: /선택한 2개 적용/ }).click();
  await expect(list.getByText('적용됨')).toHaveCount(2);

  // Ctrl+Z로 완전히 되돌아간다
  await page.locator('body').click({ position: { x: 5, y: 200 } });
  await page.keyboard.press('Control+z');
  await expect(list.getByText('적용됨')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(list.getByText('적용됨')).toHaveCount(2);

  // 5초에서 무음 2구간(각 1초, 앞뒤 여백 200ms씩 남김) → 약 3.8초
  const expected = await outputSeconds(page);
  expect(expected).toBeGreaterThan(3.6);
  expect(expected).toBeLessThan(4.0);

  const { file, name } = await exportWith(page, /유튜브 720p/);
  expect(name).toMatch(/\.mp4$/);
  const info = ffprobe(file);
  console.log('probe', JSON.stringify({ format: info.duration, video: info.video?.duration, audio: info.audio?.duration, expected }));
  expect(info.video?.codec_name).toBe('h264');
  expect(info.audio).toBeDefined();
  expect(Math.abs((info.video?.duration ?? 0) - expected)).toBeLessThan(0.15);
  // A/V 싱크: 영상과 소리 길이 차이 100ms 이내 (PROMPT 7-1 완료 조건)
  expect(Math.abs((info.video?.duration ?? 0) - (info.audio?.duration ?? 0))).toBeLessThan(0.1);
  expect(info.encoderTag).not.toMatch(/Lavf/); // ffmpeg 폴백이 아니라 WebCodecs 경로로 만들어졌는지
  expect(errors).toEqual([]);
});

test('수동 컷: S로 나누기 → Delete로 삭제 → 경계 1프레임 조정 → 되돌리기', async ({ page }) => {
  const errors = collectErrors(page);
  await importVideo(page, FIXTURES.silence);
  await expect.poll(() => outputSeconds(page)).toBe(5);

  const row = page.locator('[data-row="video"]');
  const width = (await row.boundingBox())!.width;
  const pxPerSec = (width - 80) / 5; // 전체 보기: 내용 폭 = 길이 × 확대 + 여백 80px
  await row.click({ position: { x: pxPerSec * 2, y: 20 } });
  await page.keyboard.press('s');
  await row.click({ position: { x: pxPerSec * 3.5, y: 20 } });
  await page.keyboard.press('Delete');
  await expect.poll(() => outputSeconds(page)).toBe(2);

  // 삭제한 구간의 시작 경계를 3프레임(0.1초) 뒤로 → 앞 구간이 늘어나 결과 2.1초
  const later = page.getByRole('button', { name: '시작 경계 1프레임 뒤로' });
  for (let i = 0; i < 3; i++) await later.click();
  await expect.poll(() => outputSeconds(page)).toBe(2.1);

  await page.locator('body').click({ position: { x: 5, y: 200 } });
  for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z');
  await expect.poll(() => outputSeconds(page)).toBe(2);
  await page.keyboard.press('Control+z');
  await expect.poll(() => outputSeconds(page)).toBe(5);
  expect(errors).toEqual([]);
});
