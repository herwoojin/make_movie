import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export const FIXTURES = {
  silence: path.resolve(__dirname, '../fixtures/silence-test.mp4'),
  speech: path.resolve(__dirname, '../fixtures/korean-speech.mp4'),
  sample: path.resolve(__dirname, '../../public/sample/editon-sample.mp4'),
  image: path.resolve(__dirname, '../fixtures/image-400x300.png'),
};

export interface ProbeStream { codec_type: string; codec_name: string; width?: number; height?: number; duration: number }

export interface ProbeInfo {
  duration: number;
  encoderTag: string;
  streams: ProbeStream[];
  video?: ProbeStream;
  audio?: ProbeStream;
}

/** 결과물 검증은 브라우저가 아닌 로컬 ffprobe로 — 앱이 만든 파일이 표준 도구에서도 정상인지 본다 */
export function ffprobe(file: string): ProbeInfo {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  const j = JSON.parse(out) as {
    format: { duration: string; tags?: { encoder?: string } };
    streams: (Omit<ProbeStream, 'duration'> & { duration?: string })[];
  };
  const streams = j.streams.map((s) => ({ ...s, duration: Number(s.duration ?? j.format.duration) }));
  return {
    duration: Number(j.format.duration),
    encoderTag: j.format.tags?.encoder ?? '',
    streams,
    video: streams.find((s) => s.codec_type === 'video'),
    audio: streams.find((s) => s.codec_type === 'audio'),
  };
}

export async function importVideo(page: Page, file: string): Promise<void> {
  await page.goto('/');
  await page.locator('input[type=file]').first().setInputFiles(file);
  await page.waitForURL(/\/editor\//, { timeout: 60_000 });
  await expect(page.getByRole('button', { name: /무음 찾기|다시 찾기/ })).toBeVisible({ timeout: 60_000 });
}

export async function openPanel(page: Page, name: '자동 컷' | '자막' | '꾸미기' | '모자이크' | '내보내기'): Promise<void> {
  await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
}

/** 에디터 상단 "원본 X초 → 결과 Y초"에서 결과 길이(초) */
export async function outputSeconds(page: Page): Promise<number> {
  const text = (await page.getByText(/→ 결과/).first().textContent()) ?? '';
  const m = /결과 ([\d.]+)초/.exec(text);
  return m ? Number(m[1]) : Number.NaN;
}

/** 사용자에게 보이는 오류 토스트 (Next.js 라우트 안내 요소의 role=alert는 제외) */
export function errorToasts(page: Page) {
  return page.locator('div[aria-live="polite"] [role="alert"]');
}

export async function exportWith(page: Page, preset: RegExp, timeout = 170_000): Promise<{ file: string; name: string }> {
  await openPanel(page, '내보내기');
  await page.getByRole('radio', { name: preset }).click();
  const downloading = page.waitForEvent('download', { timeout });
  await page.getByRole('button', { name: /^내보내기$/ }).click();
  // 실패하면 다운로드를 끝까지 기다리지 않고 오류 토스트 문구를 그대로 보여준다
  const failed = errorToasts(page).first().waitFor({ timeout }).then(async () => {
    throw new Error(`내보내기 실패 토스트: ${await errorToasts(page).first().innerText()}`);
  });
  const download = await Promise.race([downloading, failed]);
  return { file: await download.path(), name: download.suggestedFilename() };
}

export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}
