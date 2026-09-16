import { defineConfig, devices } from '@playwright/test';

// Playwright 기본 Chromium은 H.264/AAC(독점 코덱)가 빠져 있어 실제 사용자 환경과 다르다.
// 설치된 Google Chrome으로 돌리고(PW_CHANNEL=chromium 으로 바꿀 수 있음), 헤드리스 GPU 경로를 켠다.
const channel = process.env.PW_CHANNEL ?? 'chrome';
const port = Number(process.env.PORT ?? 3100);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: channel,
      use: {
        ...devices['Desktop Chrome'],
        channel: channel === 'chromium' ? undefined : channel,
        viewport: { width: 1440, height: 900 },
        launchOptions: { args: ['--use-gl=angle', '--enable-features=SharedArrayBuffer', '--autoplay-policy=no-user-gesture-required'] },
      },
    },
  ],
});
