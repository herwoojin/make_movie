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

// 실제 음성 인식 + 번역 흐름 (번역 서버 응답만 가짜로 대신한다 — 키 없이도 화면 흐름을 끝까지 확인)
test('번역 화면: 단계·구간·방금 알아들은/번역한 문장이 보이고 100%로 끝난다 (@network)', async ({ page }) => {
  test.skip(!process.env.RUN_NETWORK, '음성 인식 모델 다운로드가 필요해 RUN_NETWORK=1 일 때만 실행');
  test.setTimeout(600_000);
  const errors = collectErrors(page);

  let geminiCalls = 0;
  await page.route('https://generativelanguage.googleapis.com/**', async (route) => {
    geminiCalls += 1;
    const body = route.request().postDataJSON() as { contents: { parts: { text: string }[] }[] };
    const prompt = body.contents[0].parts[0].text;
    const line = prompt.split('\n').find((l) => l.trim().startsWith('[')) ?? '[]';
    const items = JSON.parse(line) as (string | { 원문: string })[];
    const out = items.map((it) => `번역됨: ${typeof it === 'string' ? it : it.원문}`);
    await new Promise((r) => setTimeout(r, 300)); // 실제 서버처럼 잠깐 걸리게
    await route.fulfill({ json: { candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] } }] } });
  });

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
  expect(geminiCalls).toBeGreaterThanOrEqual(2); // 1차 번역 + 정밀 재검수
  expect(errors).toEqual([]);
});
