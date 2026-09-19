import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      include: ['src/lib/core/**', 'src/lib/audio/silence.ts', 'src/lib/audio/peaks.ts', 'src/lib/subtitle/**', 'src/lib/vision/tracker.ts'],
      thresholds: { lines: 90, functions: 90, branches: 80 },
    },
  },
  // Next는 JSX를 그대로 두지만(tsconfig jsx: preserve) 테스트에서는 바로 변환해야 한다
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
