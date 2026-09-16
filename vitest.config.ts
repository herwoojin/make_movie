import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    coverage: {
      include: ['src/lib/core/**', 'src/lib/audio/silence.ts', 'src/lib/audio/peaks.ts', 'src/lib/subtitle/**', 'src/lib/vision/tracker.ts'],
      thresholds: { lines: 90, functions: 90, branches: 80 },
    },
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
});
