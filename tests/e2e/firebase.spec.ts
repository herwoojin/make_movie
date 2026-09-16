import { expect, test } from '@playwright/test';
import { errorToasts } from './helpers';

// 가짜 NEXT_PUBLIC_FIREBASE_* 값으로 빌드했을 때만 실행 (FIREBASE_DUMMY=1).
// 실제 로그인은 못 하지만, 격리된 페이지에서 SDK가 깨지지 않고 로그인 흐름이 연결되는지 확인한다.
test.describe('Firebase 설정이 있을 때', () => {
  test.skip(!process.env.FIREBASE_DUMMY, '가짜 Firebase 설정으로 빌드했을 때만 실행');

  test('격리된 페이지에서 SDK가 초기화되고 로그아웃 상태로 판별된다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/settings');
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
    await expect(page.getByRole('link', { name: 'Google 계정으로 로그인하러 가기' })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('banner').getByRole('link', { name: /로그인/ })).toBeVisible();

    await page.goto('/tools');
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(true);
    await expect(page.getByRole('banner').getByRole('link', { name: /로그인/ })).toBeVisible({ timeout: 20_000 });
    expect(errors).toEqual([]);
  });

  test('로그인 페이지: Google 버튼 → 팝업이 열리거나 설정 오류 안내가 나온다', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/login?next=/tools');
    expect(await page.evaluate(() => self.crossOriginIsolated)).toBe(false);
    const button = page.getByRole('button', { name: 'Google 계정으로 로그인' });
    await expect(button).toBeVisible({ timeout: 20_000 });

    const popup = page.waitForEvent('popup', { timeout: 20_000 }).then(() => 'popup' as const).catch(() => null);
    const toast = errorToasts(page).first().waitFor({ timeout: 20_000 }).then(() => 'toast' as const).catch(() => null);
    await button.click();
    const outcome = (await Promise.race([popup, toast])) ?? (await popup) ?? (await toast);
    console.log('login outcome:', outcome, outcome === 'toast' ? await errorToasts(page).first().innerText() : '');
    expect(outcome).not.toBeNull();
    expect(errors).toEqual([]);
  });
});
