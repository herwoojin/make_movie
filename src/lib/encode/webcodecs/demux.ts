// mp4box.js 디먹서. 파일 전체를 메모리에 올리지 않고 조각 단위로 읽는다.
// 임포트 메타 추출, 얼굴 스캔, 내보내기 렌더가 모두 이 모듈로 샘플을 꺼낸다.
import { createFile, DataStream, Endianness, MP4BoxBuffer, type Movie, type Sample, type Track } from 'mp4box';
import { AppError, throwIfAborted } from '@/lib/errors';

const READ_CHUNK = 8 * 1024 * 1024;

type IsoFile = ReturnType<typeof createFile>;

export interface TrackTiming {
  timescale: number;
  /** 편집 목록(edit list) 보정. <video>가 적용하는 표시 시각과 맞추기 위함 */
  offsetUs: number;
}

export interface VideoTrackInfo {
  id: number;
  codec: string;
  width: number;
  height: number;
  fps: number;
  durationMs: number;
  nbSamples: number;
  config: VideoDecoderConfig;
  timing: TrackTiming;
}

export interface AudioTrackInfo {
  id: number;
  codec: string;
  sampleRate: number;
  channels: number;
  durationMs: number;
  nbSamples: number;
  config: AudioDecoderConfig;
  timing: TrackTiming;
}

export interface Mp4Info {
  durationMs: number;
  video: VideoTrackInfo | null;
  audio: AudioTrackInfo | null;
}

interface WritableBox { write(stream: DataStream): void }
interface DescriptorLike { data?: Uint8Array; findDescriptor(tag: number): DescriptorLike | undefined }
interface EntryLike { avcC?: WritableBox; hvcC?: WritableBox; vpcC?: WritableBox; av1C?: WritableBox; esds?: { esd?: DescriptorLike } }
interface EditLike { segment_duration: number; media_time: number }

function entries(file: IsoFile, trackId: number): EntryLike[] {
  return file.getTrackById(trackId).mdia.minf.stbl.stsd.entries as unknown as EntryLike[];
}

function videoDescription(file: IsoFile, trackId: number): Uint8Array | undefined {
  for (const entry of entries(file, trackId)) {
    const box = entry.avcC ?? entry.hvcC ?? entry.vpcC ?? entry.av1C;
    if (!box) continue;
    const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN);
    box.write(stream);
    // 박스 헤더(크기 4 + 타입 4바이트)를 떼어낸 본문이 디코더 description
    return new Uint8Array((stream as unknown as { buffer: ArrayBuffer }).buffer, 8);
  }
  return undefined;
}

function audioDescription(file: IsoFile, trackId: number): Uint8Array | undefined {
  for (const entry of entries(file, trackId)) {
    const dsi = entry.esds?.esd?.findDescriptor(4)?.findDescriptor(5);
    if (dsi?.data?.length) return dsi.data;
  }
  return undefined;
}

function timingFor(track: Track, movieTimescale: number): TrackTiming {
  let offsetUs = 0;
  for (const e of (track.edits ?? []) as unknown as EditLike[]) {
    if (e.media_time === -1) {
      offsetUs += (e.segment_duration / movieTimescale) * 1e6;
      continue;
    }
    offsetUs -= (e.media_time / track.timescale) * 1e6;
    break;
  }
  return { timescale: track.timescale, offsetUs };
}

function normalizeAudioCodec(codec: string): string {
  const c = codec.toLowerCase();
  if (c === 'opus') return 'opus';
  if (c.startsWith('mp4a.6b') || c.startsWith('mp4a.69')) return 'mp3';
  if (c === 'mp4a.40.02') return 'mp4a.40.2';
  return codec;
}

/** 샘플 수/길이로 구한 fps는 마지막 프레임 길이 때문에 29.92처럼 조금 어긋난다 — 정수 근처면 정수로 */
export function normalizeFps(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 30;
  const rounded = Math.round(raw);
  return Math.abs(raw - rounded) < 0.1 ? rounded : Math.round(raw * 100) / 100;
}

export function sampleTimeUs(sample: Sample, timing: TrackTiming): number {
  return Math.round((sample.cts / timing.timescale) * 1e6 + timing.offsetUs);
}

export function sampleDurationUs(sample: Sample, timing: TrackTiming): number {
  return Math.round((sample.duration / timing.timescale) * 1e6);
}

const unsupported = () => new AppError('UNSUPPORTED_FORMAT', 'MP4/MOV 형식이 아니거나 파일 구조를 읽지 못했습니다.', 'MP4(H.264) 파일로 변환한 뒤 올려 주세요. 예비 인코더(ffmpeg)로는 계속 편집할 수 있습니다.');

export class Mp4Demuxer {
  private constructor(private readonly blob: Blob, private readonly file: IsoFile, readonly info: Mp4Info) {}

  static async open(blob: Blob, signal?: AbortSignal): Promise<Mp4Demuxer> {
    const file = createFile();
    const state: { movie: Movie | null; error: string | null } = { movie: null, error: null };
    file.onReady = (m) => { state.movie = m; };
    file.onError = (_module, message) => { state.error = message; };

    let offset = 0;
    while (!state.movie && offset < blob.size) {
      throwIfAborted(signal);
      const ab = await blob.slice(offset, offset + READ_CHUNK).arrayBuffer();
      let next: number;
      try {
        next = file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(ab, offset), offset + ab.byteLength >= blob.size);
      } catch {
        throw unsupported();
      }
      if (state.error) throw unsupported();
      // mp4box는 다음에 필요한 파일 위치를 알려준다 — moov가 뒤에 있으면 mdat을 건너뛴다
      offset = next > offset ? next : offset + ab.byteLength;
    }
    if (!state.movie) file.flush();
    const movie = state.movie as Movie | null;
    if (!movie) throw unsupported();

    const vt = movie.videoTracks[0];
    const at = movie.audioTracks[0];
    const video: VideoTrackInfo | null = vt ? {
      id: vt.id,
      codec: vt.codec,
      width: vt.video?.width ?? vt.track_width,
      height: vt.video?.height ?? vt.track_height,
      fps: normalizeFps(vt.duration > 0 ? vt.nb_samples / (vt.duration / vt.timescale) : 30),
      durationMs: Math.round((vt.duration / vt.timescale) * 1000),
      nbSamples: vt.nb_samples,
      config: {
        codec: vt.codec,
        codedWidth: vt.video?.width ?? vt.track_width,
        codedHeight: vt.video?.height ?? vt.track_height,
        description: videoDescription(file, vt.id),
      },
      timing: timingFor(vt, movie.timescale),
    } : null;
    const audio: AudioTrackInfo | null = at?.audio ? {
      id: at.id,
      codec: normalizeAudioCodec(at.codec),
      sampleRate: at.audio.sample_rate,
      channels: at.audio.channel_count,
      durationMs: Math.round((at.duration / at.timescale) * 1000),
      nbSamples: at.nb_samples,
      config: {
        codec: normalizeAudioCodec(at.codec),
        sampleRate: at.audio.sample_rate,
        numberOfChannels: at.audio.channel_count,
        description: audioDescription(file, at.id),
      },
      timing: timingFor(at, movie.timescale),
    } : null;
    const durationMs = movie.timescale > 0 ? Math.round((movie.duration / movie.timescale) * 1000) : 0;
    return new Mp4Demuxer(blob, file, { durationMs: durationMs || video?.durationMs || audio?.durationMs || 0, video, audio });
  }

  /**
   * 샘플을 파일 순서(오디오·비디오가 자연스럽게 섞인 순서)로 흘려준다.
   * onSamples가 false를 돌려주면 읽기를 멈춘다(내보낼 구간이 끝난 뒤 나머지를 읽지 않기 위해).
   */
  async readSamples(
    trackIds: number[],
    onSamples: (trackId: number, samples: Sample[]) => Promise<boolean | void> | boolean | void,
    signal?: AbortSignal,
  ): Promise<void> {
    const queue: { id: number; samples: Sample[] }[] = [];
    this.file.onSamples = (id, _user, samples) => { queue.push({ id, samples }); };
    for (const id of trackIds) this.file.setExtractionOptions(id, undefined, { nbSamples: 64 });
    this.file.start();
    let offset = this.file.seek(0, true).offset;
    let stop = false;

    const drain = async () => {
      while (queue.length && !stop) {
        const batch = queue.shift()!;
        const keepGoing = await onSamples(batch.id, batch.samples);
        const last = batch.samples[batch.samples.length - 1];
        if (last) this.file.releaseUsedSamples(batch.id, last.number + 1);
        if (keepGoing === false) stop = true;
      }
    };

    try {
      await drain();
      while (!stop && offset < this.blob.size) {
        throwIfAborted(signal);
        const ab = await this.blob.slice(offset, offset + READ_CHUNK).arrayBuffer();
        const next = this.file.appendBuffer(MP4BoxBuffer.fromArrayBuffer(ab, offset), offset + ab.byteLength >= this.blob.size);
        await drain();
        offset = next > offset ? next : offset + ab.byteLength;
      }
      if (!stop) {
        this.file.flush();
        await drain();
      }
    } finally {
      this.file.stop();
      this.file.onSamples = undefined;
    }
  }
}
