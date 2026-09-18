import { expect, test } from '@playwright/test';
import { collectErrors, FIXTURES } from './helpers';

test('번역 화면: 도우미가 없어도 유튜브 칸만 잠기고 나머지는 모두 쓸 수 있다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/translate');

  await expect(page.getByRole('heading', { name: '해외 영상 한국어 자막' })).toBeVisible();
  await expect(page.getByText('내 컴퓨터 도우미 필요')).toBeVisible();
  await expect(page.getByText('브라우저만으로는 유튜브 영상을 받을 수 없습니다')).toBeVisible();

  // 영상을 고르기 전에는 생성 버튼이 잠겨 있다
  const start = page.getByRole('button', { name: /한국어 자막 생성/ });
  await expect(start).toBeDisabled();

  // 인식 모델·말투·번역 방식은 도우미 없이도 고를 수 있다
  await page.getByLabel('음성 인식 모델').selectOption('small');
  await expect(page.getByText('가장 정확 · 오래 걸림')).toBeVisible();
  await page.getByLabel('번역 말투').selectOption('formal');
  await page.getByLabel('번역 방식').selectOption('fast');
  await expect(page.getByText(/문장별로 바로 번역합니다/)).toBeVisible();

  // 내 컴퓨터 번역은 도우미가 없으면 고를 수 없다
  const engine = page.getByLabel('번역 엔진');
  await expect(engine.locator('option', { hasText: '내 컴퓨터에서 번역' })).toBeDisabled();

  // 용어 지정은 이 브라우저에 남는다
  await page.getByLabel('용어 지정').fill('Sunburst=선버스트');
  await page.locator('input[type=file]').setInputFiles(FIXTURES.silence);
  await expect(start).toBeEnabled();
  await page.reload();
  await expect(page.getByLabel('용어 지정')).toHaveValue('Sunburst=선버스트');

  expect(errors).toEqual([]);
});
