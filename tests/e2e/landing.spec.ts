import { expect, test } from '@playwright/test';

test('랜딩: cross-origin isolation과 5개 기능 진단이 보인다', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('무음이 잘리고');
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
  const report = page.getByRole('heading', { name: /이 브라우저 진단/ }).locator('xpath=ancestor::div[contains(@class,"rounded-xl")]').first();
  await expect(report.getByRole('listitem')).toHaveCount(5);
  await expect(report.getByRole('listitem').filter({ hasText: /✅|❌/ })).toHaveCount(5);
  await expect(page.getByRole('button', { name: '영상 올리기' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('로그인 페이지만 격리 헤더가 없고, 앱으로 돌아가면 다시 격리된다 (Firebase 팝업 로그인용)', async ({ page, request }) => {
  const login = await request.get('/login');
  expect(login.ok()).toBe(true);
  expect(login.headers()['cross-origin-opener-policy']).toBeUndefined();
  expect(login.headers()['cross-origin-embedder-policy']).toBeUndefined();
  expect((await request.get('/settings')).headers()['cross-origin-opener-policy']).toBe('same-origin');

  // 앱 헤더의 로그인 버튼은 전체 페이지 이동이어야 한다 → 로그인 페이지는 격리되지 않은 문서
  await page.goto('/tools');
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
  await page.getByRole('link', { name: /로그인/ }).click();
  await page.waitForURL(/\/login\?next=%2Ftools/);
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(false);
  // Firebase 환경변수가 있으면 로그인 버튼, 없으면 "설정되지 않음" 안내
  await expect(page.getByText(/Firebase가 설정되지 않았습니다/).or(page.getByRole('button', { name: 'Google 계정으로 로그인' }))).toBeVisible({ timeout: 20_000 });

  // "로그인하지 않고 돌아가기" → next 경로로 전체 새로고침, 다시 격리됨
  await page.getByRole('button', { name: '로그인하지 않고 돌아가기' }).click();
  await page.waitForURL(/\/tools$/);
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);

  // 로그인 페이지 상단 메뉴도 전체 새로고침 링크
  await page.goto('/login');
  await page.getByRole('link', { name: '도움말' }).click();
  await page.waitForURL(/\/help$/);
  expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
});

test('정적 페이지와 헬스 API', async ({ page, request }) => {
  const health = await request.get('/api/server-health');
  expect(health.ok()).toBe(true);
  const body = await health.json();
  expect(['ok', 'warn', 'danger', 'critical']).toContain(body.level);
  expect(health.headers()['cross-origin-embedder-policy']).toBe('credentialless');

  for (const path of ['/ffmpeg/ffmpeg-core.wasm', '/mediapipe/blaze_face_short_range.tflite', '/fonts/PretendardVariable.woff2']) {
    const res = await request.head(path);
    expect(res.status(), path).toBe(200);
  }

  await page.goto('/tools');
  await expect(page.getByRole('tab', { name: /GIF 일괄 변환/ })).toBeVisible();
  await page.goto('/settings');
  await expect(page.locator('#techStackBox')).toBeVisible();
  await page.goto('/help');
  await expect(page.getByRole('heading', { name: '키보드 단축키' })).toBeVisible();
  await expect(page.getByRole('button', { name: /용량 상태/ })).toBeVisible();
});
