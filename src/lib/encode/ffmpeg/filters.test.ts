import { describe, expect, it } from 'vitest';
import type { FrameView } from '@/lib/render/frame';
import { atempoChain, buildFfmpegArgs, estimateFfmpegMs, frameFilter, parseFfmpegTime, sec, selectExpression } from './filters';

const view = (p: Partial<FrameView> = {}): FrameView => ({
  aspectMode: 'original', fillMode: 'blur', reframe: { x: 0.5, y: 0.5, scale: 1 }, ...p,
});

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

  it('cover 맞춤은 crop', () => {
    expect(frameFilter(1080, 1920, 'cover')).toContain('crop=1080:1920');
  });

  it('비율을 바꾸면 블러 배경 그래프 / 단색은 pad / 잘라내기는 crop', () => {
    const blur = frameFilter(1080, 1920, 'contain', view({ aspectMode: '9:16', fillMode: 'blur' }), 1920, 1080);
    expect(blur).toContain('boxblur=');
    expect(blur).toContain('overlay=(W-w)/2:(H-h)/2');

    expect(frameFilter(1080, 1920, 'contain', view({ aspectMode: '9:16', fillMode: 'solid' }), 1920, 1080))
      .toBe('scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black');

    // 가로 영상을 9:16으로 잘라내면 가운데를 기준으로 오려낸다
    expect(frameFilter(1080, 1920, 'contain', view({ aspectMode: '9:16', fillMode: 'crop' }), 1920, 1080))
      .toBe('scale=3414:1920,crop=1080:1920:1167:0');
  });

  it('배속: 영상은 setpts, 소리는 atempo(음정 유지) / asetrate(음정 변화)', () => {
    const keep = buildFfmpegArgs({ ...base, format: 'mp4', speed: 1.5, pitchPreserve: true });
    expect(keep[keep.indexOf('-vf') + 1]).toContain('setpts=PTS/1.5');
    expect(keep[keep.indexOf('-af') + 1]).toContain('atempo=1.5000');

    const shift = buildFfmpegArgs({ ...base, format: 'mp4', speed: 1.5, pitchPreserve: false });
    expect(shift[shift.indexOf('-af') + 1]).toContain('asetrate=48000*1.5');

    expect(buildFfmpegArgs({ ...base, format: 'mp4', speed: 1 })[base ? 0 : 0]).toBe('-i');
    expect(atempoChain(4)).toBe('atempo=2.0,atempo=2.0000');
    expect(atempoChain(0.25)).toBe('atempo=0.5,atempo=0.5000');
    expect(atempoChain(1.5)).toBe('atempo=1.5000');
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
