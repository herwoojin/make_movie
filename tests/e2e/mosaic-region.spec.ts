import { expect, test, type Page } from '@playwright/test';
import { collectErrors, exportWith, ffprobe, FIXTURES, importVideo, openPanel } from './helpers';

/** 미리보기 위에서 (x1,y1)→(x2,y2) 비율 위치로 끈다 */
async function dragOnPreview(page: Page, x1: number, y1: number, x2: number, y2: number) {
  const box = (await page.getByRole('img', { name: /편집 결과 미리보기/ }).boundingBox())!;
  await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 6 });
  await page.mouse.up();
}

async function regionRect(page: Page, name: RegExp) {
  return (await page.getByRole('group', { name }).boundingBox())!;
}

test('얼굴이 아닌 곳도 직접 그려서 가리고, 끌어서 옮기고, 크기를 바꾼다', async ({ page }) => {
  const errors = collectErrors(page);
  await importVideo(page, FIXTURES.silence); // 5초 영상
  await openPanel(page, '모자이크');

  // 패널을 열자마자(스크롤 없이) 보여야 한다
  const drawButton = page.getByRole('button', { name: '직접 영역 그리기' });
  await expect(drawButton).toBeInViewport();
  await expect(page.getByRole('radio', { name: '영상 전체' })).toHaveAttribute('aria-checked', 'true');

  await drawButton.click();
  await dragOnPreview(page, 0.2, 0.2, 0.45, 0.4);

  // 영상 전체(0:00 – 0:05) 동안 가리는 영역이 목록 맨 위에 생긴다
  await expect(page.getByText(/0:00\.0 – 0:05\.0\s*· 직접 가림/)).toBeVisible();
  const name = /직접 가린 영역 1 위치/;
  const before = await regionRect(page, name);

  // 가운데를 끌면 옮겨진다
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  const moved = await regionRect(page, name);
  expect(moved.x).toBeGreaterThan(before.x + 40);
  expect(Math.abs(moved.width - before.width)).toBeLessThan(2);

  // 오른쪽 아래 모서리를 끌면 커진다
  const handle = (await page.getByRole('button', { name: /오른쪽 아래 모서리 크기 조절/ }).boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + 50, handle.y + 40, { steps: 5 });
  await page.mouse.up();
  const resized = await regionRect(page, name);
  expect(resized.width).toBeGreaterThan(moved.width + 30);

  // 되돌리기로 크기 조절 전으로
  await page.getByRole('button', { name: '되돌리기' }).first().click();
  const undone = await regionRect(page, name);
  expect(Math.abs(undone.width - moved.width)).toBeLessThan(2);

  // 이름을 붙이면 목록에도 보인다
  await page.getByLabel('이름').fill('이메일 주소');
  await expect(page.getByRole('button', { name: /이메일 주소/ }).first()).toBeVisible();

  // 움직이는 대상으로 바꾸면 시점별 위치 기록이 된다
  await page.getByRole('radio', { name: '움직이는 대상' }).click();
  await expect(page.getByText(/지금 1곳 기록됨/)).toBeVisible();

  // 내보낸 결과도 정상 (모자이크 합성 경로)
  const { file } = await exportWith(page, /유튜브 720p/);
  const info = ffprobe(file);
  expect(info.video?.codec_name).toBe('h264');
  expect(errors).toEqual([]);
});

test('가릴 구간을 "지금부터 5초"로 고르면 그 구간만 가린다', async ({ page }) => {
  await importVideo(page, FIXTURES.sample);
  await openPanel(page, '모자이크');
  await page.getByRole('radio', { name: '지금부터 5초' }).click();
  await page.getByRole('button', { name: '직접 영역 그리기' }).click();
  await dragOnPreview(page, 0.6, 0.1, 0.8, 0.3);
  await expect(page.getByText(/0:00\.0 – 0:05\.0\s*· 직접 가림/)).toBeVisible();

  // 구간을 영상 전체로 넓힐 수 있다
  await page.getByRole('button', { name: '영상 전체', exact: true }).click();
  await expect(page.getByText('(영상 전체)')).toBeVisible();
});
