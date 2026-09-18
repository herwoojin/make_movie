import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { collectErrors, errorToasts, exportWith, ffprobe, FIXTURES, importVideo, openPanel, outputSeconds } from './helpers';

test('ffmpeg 폴백: WebCodecs를 끈 상태에서도 컷이 반영된 결과물이 나온다', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('editon.export.encoder', JSON.stringify('ffmpeg-wasm'));
    localStorage.setItem('editon.debug', '1');
  });
  const logs: string[] = [];
  page.on('console', (m) => logs.push(m.text()));
  const errors = collectErrors(page);
  await importVideo(page, FIXTURES.silence);
  await page.getByRole('button', { name: /무음 찾기/ }).click();
  await page.getByRole('button', { name: /선택한 2개 적용/ }).click();
  const expected = await outputSeconds(page);

  try {
    const { file } = await exportWith(page, /유튜브 720p/, 120_000);
    const info = ffprobe(file);
    console.log('probe', JSON.stringify({ video: info.video?.duration, audio: info.audio?.duration, expected, encoder: info.encoderTag }));
    expect(info.encoderTag).toMatch(/Lavf/);
    expect(Math.abs((info.video?.duration ?? 0) - expected)).toBeLessThan(0.2);
    expect(info.audio).toBeDefined();
  } finally {
    console.log(logs.filter((l) => l.startsWith('[ffmpeg]')).slice(-25).join('\n'));
  }
  expect(errors).toEqual([]);
});

test('WebCodecs: 자막 번인 + 수동 모자이크를 넣어도 영상·소리가 정상', async ({ page }) => {
  const errors = collectErrors(page);
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
  await importVideo(page, FIXTURES.sample);

  await openPanel(page, '자막');
  await page.getByRole('button', { name: /재생 위치에 자막 추가/ }).click();
  const textarea = page.getByRole('textbox', { name: /자막 글자/ }).first();
  await textarea.fill('자막 번인 테스트');
  await textarea.blur();

  await openPanel(page, '모자이크');
  await page.getByRole('button', { name: /직접 영역 그리기/ }).click();
  const box = (await page.getByRole('img', { name: /편집 결과 미리보기/ }).boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByText(/직접 가린 영역 1/).first()).toBeVisible();

  try {
    const { file } = await exportWith(page, /유튜브 720p/);
    const info = ffprobe(file);
    expect(info.video).toMatchObject({ codec_name: 'h264', width: 1280, height: 720 });
    expect(info.audio?.codec_name).toMatch(/aac|opus/);
    expect(Math.abs((info.video?.duration ?? 0) - 12)).toBeLessThan(0.15);
    expect(Math.abs((info.video?.duration ?? 0) - (info.audio?.duration ?? 0))).toBeLessThan(0.1);
  } finally {
    if (logs.length) console.log(logs.slice(-20).join('\n'));
  }
  expect(errors).toEqual([]);
});

test('GIF · 오디오만(WAV) 내보내기', async ({ page }) => {
  await importVideo(page, FIXTURES.silence);
  const gif = await exportWith(page, /GIF 움짤/);
  expect(gif.name).toMatch(/\.gif$/);
  expect(readFileSync(gif.file).subarray(0, 6).toString('latin1')).toBe('GIF89a');

  const wav = await exportWith(page, /오디오만/);
  expect(wav.name).toMatch(/\.wav$/);
  const info = ffprobe(wav.file);
  expect(info.streams[0].codec_type).toBe('audio');
  expect(Math.abs(info.duration - 5)).toBeLessThan(0.2);
});

test('얼굴 찾기: MediaPipe 워커가 불러와지고 스캔이 끝난다', async ({ page }) => {
  const errors = collectErrors(page);
  await importVideo(page, FIXTURES.sample);
  await openPanel(page, '모자이크');
  await page.getByRole('button', { name: /^얼굴 자동 찾기$/ }).click();
  await expect(page.getByText(/얼굴을 찾지 못했습니다|얼굴을 찾았습니다/)).toBeVisible({ timeout: 90_000 });
  await expect(errorToasts(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('도구함: GIF 일괄 변환', async ({ page }) => {
  await page.goto('/tools/gif');
  await page.locator('input[type=file][accept="video/*"]').first().setInputFiles(FIXTURES.silence);
  await page.getByRole('button', { name: /모두 GIF로 변환/ }).click();
  const downloading = page.waitForEvent('download', { timeout: 90_000 });
  await page.getByRole('button', { name: /GIF 받기/ }).click({ timeout: 90_000 });
  const download = await downloading;
  expect(readFileSync(await download.path()).subarray(0, 6).toString('latin1')).toBe('GIF89a');
});

test('로컬 Whisper: 한국어 단어 타임스탬프로 자막 생성 (@network)', async ({ page }) => {
  test.skip(!process.env.RUN_NETWORK, '음성 인식 모델(수십~150MB) 다운로드가 필요해 RUN_NETWORK=1 일 때만 실행');
  test.setTimeout(600_000);
  const errors = collectErrors(page);
  await importVideo(page, FIXTURES.speech);
  await openPanel(page, '자막');
  // 짧은 영상은 "방금 알아들은 말"이 잠깐만 떠서 폴링으로는 놓칠 수 있다 — 화면 변화를 모두 기록해 둔다
  await page.evaluate(() => {
    const w = window as unknown as { __heard: string[]; __pct: string[] };
    w.__heard = [];
    w.__pct = [];
    new MutationObserver(() => {
      document.querySelectorAll('blockquote').forEach((q) => {
        if (q.textContent?.includes('방금 알아들은 말')) w.__heard.push(q.textContent);
      });
      const box = document.querySelector('[aria-label="자막 만들기 진행 상황"]');
      const pct = box?.querySelector('h3 + span')?.textContent;
      if (pct && w.__pct[w.__pct.length - 1] !== pct) w.__pct.push(pct);
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.getByRole('button', { name: /^자막 만들기$/ }).click();

  // 진행 화면: 단계 목록이 보이고, 인식 중에는 구간이 나온다
  const progress = page.getByRole('status', { name: '자막 만들기 진행 상황' });
  await expect(progress.getByText('음성을 글자로 바꾸기')).toBeVisible();
  await expect(progress.getByText(/구간 \d+\/\d+/)).toBeVisible({ timeout: 540_000 });
  // 끝나면 100%와 완료 표시
  await expect(page.getByText('자막 만들기 완료')).toBeVisible({ timeout: 540_000 });
  await expect(progress.getByText('100%')).toBeVisible();

  const seen = await page.evaluate(() => {
    const w = window as unknown as { __heard: string[]; __pct: string[] };
    return { __heard: w.__heard, __pct: w.__pct };
  });
  console.log('화면에 흘러나온 문장:', seen.__heard.slice(-3), '진행률 변화:', seen.__pct.join(' → '));
  // 인식 중에 실제 문장이 화면에 흘러나왔다
  expect(seen.__heard.some((t) => /안녕/.test(t))).toBe(true);
  // 진행률은 뒤로 가지 않고 100%로 끝난다
  const pcts = seen.__pct.map((p) => Number(p.replace('%', '')));
  expect(pcts[pcts.length - 1]).toBe(100);
  expect(pcts.every((v, i) => i === 0 || v >= pcts[i - 1])).toBe(true);

  const outcome = page.getByText(/자막 클립 \d+개를 만들었습니다|말소리를 찾지 못했습니다/).or(errorToasts(page));
  await expect(outcome.first()).toBeVisible({ timeout: 540_000 });
  await expect(errorToasts(page)).toHaveCount(0);
  const first = page.getByRole('textbox', { name: /자막 글자/ }).first();
  await expect(first).toHaveValue(/안녕/);
  await openPanel(page, '자동 컷');
  await page.getByRole('button', { name: /추임새 찾기/ }).click();
  await expect(page.getByText(/추임새 \d+곳을 찾았습니다|추임새를 찾지 못했습니다/)).toBeVisible();
  expect(errors).toEqual([]);
});
