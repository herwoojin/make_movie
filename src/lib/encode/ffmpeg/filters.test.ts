import { describe, expect, it } from 'vitest';
import { buildFfmpegArgs, estimateFfmpegMs, parseFfmpegTime, scaleFilter, sec, selectExpression } from './filters';

const ranges = [{ startMs: 0, endMs: 3200 }, { startMs: 5100, endMs: 9800 }];
const base = { input: '/in/a.mp4', output: '/out.mp4', ranges, width: 1280, height: 720, fps: 30, fit: 'contain' as const, hasAudio: true, bitrate: 0 };

describe('ffmpeg filters', () => {
  it('select 표현식 (TRD 4.6 예시와 동일)', () => {
    expect(selectExpression(ranges)).toBe('between(t,0.000,3.200)+between(t,5.100,9.800)');
    expect(sec(-5)).toBe('0.000');
  });

  it('mp4: 컷 → 스케일 → 자막 순서, 오디오 aselect', () => {
    const args = buildFfmpegArgs({ ...base, format: 'mp4', assPath: '/sub.ass', fontsDir: '/fonts' });
    const vf = args[args.indexOf('-vf') + 1];
    expect(vf.indexOf('select=')).toBeLessThan(vf.indexOf('scale='));
    expect(vf.endsWith('subtitles=/sub.ass:fontsdir=/fonts')).toBe(true);
    expect(args[args.indexOf('-af') + 1]).toBe("aselect='between(t,0.000,3.200)+between(t,5.100,9.800)',asetpts=N/SR/TB");
    expect(args).toContain('ultrafast');
    expect(args[args.length - 1]).toBe('/out.mp4');
  });

  it('소리 없는 원본은 -an', () => {
    const args = buildFfmpegArgs({ ...base, format: 'mp4', hasAudio: false });
    expect(args).toContain('-an');
    expect(args).not.toContain('-af');
  });

  it('gif / mp3 / 구운 프레임', () => {
    expect(buildFfmpegArgs({ ...base, format: 'gif' }).join(' ')).toContain('palettegen');
    expect(buildFfmpegArgs({ ...base, format: 'mp3' })).toContain('libmp3lame');
    const baked = buildFfmpegArgs({ ...base, format: 'mp4', bakedFramesPattern: '/frames/%06d.jpg' });
    expect(baked.slice(0, 4)).toEqual(['-framerate', '30', '-i', '/frames/%06d.jpg']);
    expect(baked).toContain('1:a');
    expect(buildFfmpegArgs({ ...base, hasAudio: false, format: 'mp4', bakedFramesPattern: '/f/%06d.jpg' })).not.toContain('1:a');
  });

  it('cover 스케일은 crop', () => {
    expect(scaleFilter(1080, 1920, 'cover')).toContain('crop=1080:1920');
  });

  it('로그 time= 파싱', () => {
    expect(parseFfmpegTime('frame=  100 fps= 25 q=28.0 size=512kB time=00:01:02.50 bitrate=')).toBe(62_500);
    expect(parseFfmpegTime('no time here')).toBeNull();
    expect(parseFfmpegTime('time=00:00:05')).toBe(5000);
  });

  it('예상 시간', () => {
    expect(estimateFfmpegMs(60_000, 1920, 1080, true)).toBe(90_000);
    expect(estimateFfmpegMs(60_000, 1920, 1080, false)).toBe(270_000);
  });
});
