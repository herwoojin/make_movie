import { expect, test } from '@playwright/test';
import { FIXTURES, importVideo, openPanel } from './helpers';

// 눈으로 확인하는 용도 (PLAN G4). SHOTS=1 일 때만 실행: test-results/shots/*.png
test('주요 화면 스크린샷', async ({ page }) => {
  test.skip(!process.env.SHOTS, 'SHOTS=1 일 때만 실행');
  const shot = (name: string) => page.screenshot({ path: `test-results/shots/${name}.png` });

  await page.goto('/');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'test-results/shots/01-landing.png', fullPage: true });

  await importVideo(page, FIXTURES.sample);
  await page.getByRole('button', { name: /무음 찾기/ }).click();
  await expect(page.getByRole('list', { name: '자를 제안 목록' })).toBeVisible();
  await page.waitForTimeout(2500);
  await shot('02-editor-autocut');

  await openPanel(page, '자막');
  await page.getByRole('button', { name: /재생 위치에 자막 추가/ }).click();
  const textarea = page.getByRole('textbox', { name: /자막 글자/ }).first();
  await textarea.fill('안녕하세요, 편집ON 자막 미리보기입니다');
  await textarea.blur();
  await page.waitForTimeout(500);
  await shot('03-editor-subtitle');

  await openPanel(page, '꾸미기');
  await page.getByRole('button', { name: /굵은 예능자막/ }).click();
  await page.waitForTimeout(500);
  await shot('04-editor-style');

  await openPanel(page, '모자이크');
  await page.getByRole('button', { name: /미리보기에 네모 그리기/ }).click();
  const box = (await page.getByRole('img', { name: /편집 결과 미리보기/ }).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.55, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.5, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  await shot('05-editor-mosaic');

  await openPanel(page, '내보내기');
  await page.waitForTimeout(300);
  await shot('06-editor-export');

  for (const [path, name] of [['/tools', '07-tools'], ['/settings', '08-settings'], ['/projects', '09-projects']] as const) {
    await page.goto(path);
    await page.waitForTimeout(1000);
    await shot(name);
  }
});
