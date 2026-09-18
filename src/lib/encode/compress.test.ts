import { describe, expect, it } from 'vitest';
import { buildCompressJob, compressedSize, estimateBytes, getCompressPreset, planCompression, presetBitrate, targetBitrate } from './compress';

const asset = { width: 1920, height: 1080, fps: 30, durationMs: 60_000, audioCodec: 'aac' };

describe('compressedSize', () => {
  it('상한보다 작으면 그대로, 크면 비율을 지켜 줄인다', () => {
    expect(compressedSize(1280, 720, 1080)).toEqual({ width: 1280, height: 720 });
    expect(compressedSize(1920, 1080, 720)).toEqual({ width: 1280, height: 720 });
    expect(compressedSize(1080, 1920, 480)).toEqual({ width: 270, height: 480 });
  });
  it('짝수로 맞춘다 (h264 요구)', () => {
    const { width, height } = compressedSize(1001, 563, 480);
    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });
});

describe('targetBitrate', () => {
  it('목표 20MB · 60초 → 오디오를 뺀 비트레이트', () => {
    const bps = targetBitrate(20, 60_000, 128);
    // (20MB × 8 × 1024 × 1024) / 60 ≈ 2.79Mbps, 오디오 128kbps를 뺀다
    expect(bps).toBeGreaterThan(2_500_000);
    expect(bps).toBeLessThan(2_800_000);
    expect(estimateBytes(bps, 60_000, true) / (1024 * 1024)).toBeCloseTo(20, 1);
  });
  it('너무 짧거나 목표가 작아도 최소 비트레이트를 지킨다', () => {
    expect(targetBitrate(0.1, 600_000)).toBe(120_000);
  });
});

describe('planCompression', () => {
  it('프리셋마다 크기와 예상 용량이 줄어든다', () => {
    const high = planCompression(asset, 'high');
    const light = planCompression(asset, 'light');
    const min = planCompression(asset, 'min');
    expect(high.height).toBe(1080);
    expect(light.height).toBe(720);
    expect(min.height).toBe(480);
    expect(high.estimatedBytes).toBeGreaterThan(light.estimatedBytes);
    expect(light.estimatedBytes).toBeGreaterThan(min.estimatedBytes);
  });

  it('목표 용량을 지정하면 그 크기 근처로 계산된다', () => {
    const plan = planCompression(asset, 'target', 20);
    expect(plan.estimatedBytes / (1024 * 1024)).toBeCloseTo(20, 0);
  });

  it('소리가 없으면 오디오 비트레이트를 더하지 않는다', () => {
    const silent = planCompression({ ...asset, audioCodec: 'none' }, 'standard');
    const withAudio = planCompression(asset, 'standard');
    expect(silent.estimatedBytes).toBeLessThan(withAudio.estimatedBytes);
  });

  it('CRF가 높을수록 비트레이트가 낮다', () => {
    expect(presetBitrate(1920, 1080, 30, 20)).toBeGreaterThan(presetBitrate(1920, 1080, 30, 32));
  });
});

describe('buildCompressJob', () => {
  it('컷·자막 없이 전체 구간을 담는다', () => {
    const job = buildCompressJob(asset, planCompression(asset, 'standard'));
    expect(job.edl).toHaveLength(1);
    expect(job.edl[0]).toMatchObject({ sourceStartMs: 0, sourceEndMs: 60_000, enabled: true });
    expect(job.subtitles).toBeUndefined();
    expect(job.output.format).toBe('mp4');
  });
});

describe('getCompressPreset', () => {
  it('모르는 id면 표준으로', () => {
    expect(getCompressPreset('없음').id).toBe('standard');
  });
});
