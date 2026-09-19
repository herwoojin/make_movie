import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectErrors, FIXTURES } from './helpers';

/**
 * 구글 번역 서버 흉내. 모델 목록(GET)과 번역(POST)을 대신 답한다.
 * brokenModel로 고른 모델은 실제로 내려간 모델처럼 404를 돌려준다.
 */
async function fakeGemini(page: Page, models = ['gemini-3.6-flash']) {
  const state = { translateCalls: 0, keyInUrl: false, brokenModel: '', models };
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    const req = route.request();
    if (/[?&]key=/.test(req.url())) state.keyInUrl = true;
    if (req.method() === 'GET') {
      await route.fulfill({ json: { models: state.models.map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'] })) } });
      return;
    }
    if (state.brokenModel && req.url().includes(`/models/${state.brokenModel}:`)) {
      await route.fulfill({ status: 404, json: { error: { code: 404, message: `models/${state.brokenModel} is not found for API version v1beta`, status: 'NOT_FOUND' } } });
      return;
    }
    state.translateCalls += 1;
    const body = req.postDataJSON() as { contents: { parts: { text: string }[] }[] };
    const prompt = body.contents[0].parts[0].text;
    const line = prompt.split('\n').find((l) => l.trim().startsWith('[')) ?? '[]';
    const items = JSON.parse(line) as (string | { 원문: string })[];
    const out = items.map((it) => `번역됨: ${typeof it === 'string' ? it : it.원문}`);
    await new Promise((r) => setTimeout(r, 300)); // 실제 서버처럼 잠깐 걸리게
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] } });
  });
  return state;
}

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

// 실제 음성 인식 + 번역 흐름 (번역 서버 응답만 가짜로 대신한다 — 키 없이도 화면 흐름을 끝까지 확인)
test('번역 화면: 단계·구간·방금 알아들은/번역한 문장이 보이고 100%로 끝난다 (@network)', async ({ page }) => {
  test.skip(!process.env.RUN_NETWORK, '음성 인식 모델 다운로드가 필요해 RUN_NETWORK=1 일 때만 실행');
  test.setTimeout(600_000);
  const errors = collectErrors(page);

  const google = await fakeGemini(page);

  await page.goto('/translate');
  await page.evaluate(() => localStorage.setItem('editon.byok.gemini', JSON.stringify('test-key')));
  await page.reload();
  await page.getByLabel('원어').selectOption('ko');
  await page.locator('input[type=file]').setInputFiles(FIXTURES.speech);

  await page.evaluate(() => {
    const w = window as unknown as { __texts: string[]; __pct: number[] };
    w.__texts = [];
    w.__pct = [];
    new MutationObserver(() => {
      document.querySelectorAll('blockquote').forEach((q) => w.__texts.push(q.textContent ?? ''));
      const pct = document.querySelector('[aria-label="한국어 자막 만들기 진행 상황"] h3 + span')?.textContent;
      if (pct) {
        const v = Number(pct.replace('%', ''));
        if (w.__pct[w.__pct.length - 1] !== v) w.__pct.push(v);
      }
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });

  await page.getByRole('button', { name: /한국어 자막 생성/ }).click();
  await page.getByRole('button', { name: '전송하고 자막 만들기' }).click();

  const box = page.getByRole('status', { name: '한국어 자막 만들기 진행 상황' });
  await expect(box.getByText('원어 자막 만들기')).toBeVisible();
  await expect(page.getByText('한국어 자막 만들기 완료')).toBeVisible({ timeout: 540_000 });
  await expect(box.getByText('100%')).toBeVisible();

  const seen = await page.evaluate(() => {
    const w = window as unknown as { __texts: string[]; __pct: number[] };
    return { texts: w.__texts, pct: w.__pct };
  });
  console.log('진행률:', seen.pct.join(' → '));
  expect(seen.texts.some((t) => t.includes('방금 알아들은 말') && /안녕/.test(t))).toBe(true);
  expect(seen.texts.some((t) => t.includes('방금 번역한 문장') && t.includes('번역됨:'))).toBe(true);
  expect(seen.pct[seen.pct.length - 1]).toBe(100);
  expect(seen.pct.every((v, i) => i === 0 || v >= seen.pct[i - 1])).toBe(true);

  // 결과 표와 2단계 인계
  await expect(page.getByRole('textbox', { name: /한국어 자막/ }).first()).toHaveValue(/번역됨: /);
  expect(google.translateCalls).toBeGreaterThanOrEqual(2); // 1차 번역 + 정밀 재검수
  expect(google.keyInUrl).toBe(false); // 키는 헤더로만
  expect(errors).toEqual([]);
});

// 번역이 실패하면(예: 구글이 모델을 내림 → 404) 원어 자막이 남고, 음성 인식 없이 번역만 다시 한다
test('번역 화면: 번역이 실패해도 원어 자막은 남고 "번역 다시 시도"로 번역만 다시 한다 (@network)', async ({ page }) => {
  test.skip(!process.env.RUN_NETWORK, '음성 인식 모델 다운로드가 필요해 RUN_NETWORK=1 일 때만 실행');
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  const google = await fakeGemini(page);
  google.brokenModel = 'gemini-3.6-flash'; // 목록에 하나뿐인 모델이 404 → 번역 실패

  await page.goto('/translate');
  await page.evaluate(() => localStorage.setItem('editon.byok.gemini', JSON.stringify('test-key')));
  await page.reload();
  await page.getByLabel('원어').selectOption('ko');
  await page.getByLabel('음성 인식 모델').selectOption('tiny');
  await page.getByLabel('번역 방식').selectOption('fast');
  await page.locator('input[type=file]').setInputFiles(FIXTURES.speech);
  await page.getByRole('button', { name: /한국어 자막 생성/ }).click();
  await page.getByRole('button', { name: '전송하고 자막 만들기' }).click();

  // 실패 안내 + 원어 자막이 담긴 표
  const alert = page.getByRole('alert').filter({ hasText: '번역을 끝내지 못했습니다' });
  await expect(alert).toBeVisible({ timeout: 540_000 });
  await expect(alert).toContainText('번역 모델을 찾지 못했습니다');
  await expect(alert).toContainText('음성 인식은 다시 하지 않습니다');
  await expect(alert).toContainText(/0\/\d+줄 번역됨/);
  const firstRow = page.getByRole('textbox', { name: /한국어 자막/ }).first();
  await expect(firstRow).toHaveValue('');
  await expect(page.locator('tbody tr').first()).toContainText(/\S/); // 원어 칸은 채워져 있다

  // 구글이 새 모델을 내놓았다고 치고 다시 시도 → 번역·저장 단계만 보인다
  google.models = ['gemini-3.6-flash', 'gemini-2.5-flash'];
  await alert.getByRole('button', { name: '번역 다시 시도' }).click();
  const box = page.getByRole('status', { name: '한국어 자막 만들기 진행 상황' });
  await expect(box.getByText('한국어로 번역')).toBeVisible();
  await expect(box.getByText('원어 자막 만들기')).toHaveCount(0);
  await expect(page.getByText('한국어 자막 만들기 완료')).toBeVisible({ timeout: 60_000 });

  await expect(firstRow).toHaveValue(/번역됨: /);
  await expect(page.getByRole('alert').filter({ hasText: '번역을 끝내지 못했습니다' })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('editon.translate.geminiModel'))).toBe(JSON.stringify('gemini-2.5-flash'));
  expect(google.keyInUrl).toBe(false);

  // 2단계로 넘기면 번역이 그대로 따라간다
  await page.getByRole('button', { name: /2단계 자막·영상 편집/ }).first().click();
  await expect(page).toHaveURL(/\/editor\//);
  expect(errors).toEqual([]);
});
