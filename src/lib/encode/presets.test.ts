import { describe, expect, it } from 'vitest';
import { EXPORT_PRESETS, getPreset, mimeFor, resolveFps, resolveOutputSize } from './presets';

describe('presets', () => {
  it('1080p: 4K 원본은 줄이고, 720p 원본은 키우지 않는다', () => {
    const p = getPreset('youtube-1080p');
    expect(resolveOutputSize(p, 3840, 2160)).toEqual({ width: 1920, height: 1080 });
    expect(resolveOutputSize(p, 1280, 720)).toEqual({ width: 1280, height: 720 });
  });
  it('세로 원본은 긴 변(세로) 기준, 크기는 짝수', () => {
    expect(resolveOutputSize(getPreset('youtube-720p'), 1081, 1921)).toEqual({ width: 720, height: 1280 });
    expect(resolveOutputSize(getPreset('gif'), 641, 361)).toEqual({ width: 480, height: 270 });
  });
  it('쇼츠는 고정 크기, 알 수 없는 원본 크기는 1920x1080 가정', () => {
    expect(resolveOutputSize(getPreset('shorts-1080x1920'), 1920, 1080)).toEqual({ width: 1080, height: 1920 });
    expect(resolveOutputSize(getPreset('youtube-1080p'), 0, 0)).toEqual({ width: 1920, height: 1080 });
  });
  it('fps: source는 원본(최대 60), 고정값은 원본을 넘지 않음', () => {
    expect(resolveFps(getPreset('youtube-1080p'), 29.97)).toBe(29.97);
    expect(resolveFps(getPreset('youtube-1080p'), 120)).toBe(60);
    expect(resolveFps(getPreset('gif'), 30)).toBe(10);
    expect(resolveFps(getPreset('gif'), 8)).toBe(8);
    expect(resolveFps(getPreset('youtube-1080p'), 0)).toBe(30);
  });
  it('없는 id는 첫 프리셋, mime', () => {
    expect(getPreset('nope').id).toBe(EXPORT_PRESETS[0].id);
    expect(mimeFor('mp4')).toBe('video/mp4');
    expect(mimeFor('gif')).toBe('image/gif');
    expect(mimeFor('wav')).toBe('audio/wav');
    expect(mimeFor('mp3')).toBe('audio/mpeg');
    expect(mimeFor('webm')).toBe('video/webm');
  });
});
