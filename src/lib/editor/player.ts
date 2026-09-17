// <video> 요소를 재생 시계로 쓰는 얇은 컨트롤러. 컴포넌트 여러 곳(단축키, 타임라인, 목록의 미리듣기)이
// 같은 video를 제어해야 해서 React 트리 밖 싱글턴으로 둔다.

interface RangeMode {
  startMs: number;
  endMs: number;
  /** 잘린 구간을 건너뛰며 재생할지 (클립 미리듣기=true, 컷 구간 확인=false) */
  skipCuts: boolean;
  loop: boolean;
  clipId: string | null;
}

class Player {
  private video: HTMLVideoElement | null = null;
  private range: RangeMode | null = null;

  attach(video: HTMLVideoElement): void {
    this.video = video;
  }

  detach(video: HTMLVideoElement): void {
    if (this.video === video) this.video = null;
  }

  get element(): HTMLVideoElement | null {
    return this.video;
  }

  currentMs(): number {
    return this.video ? Math.round(this.video.currentTime * 1000) : 0;
  }

  isPlaying(): boolean {
    return !!this.video && !this.video.paused && !this.video.ended;
  }

  async play(): Promise<void> {
    if (!this.video) return;
    try {
      await this.video.play();
    } catch {
      // 사용자 제스처 없이 재생이 막힌 경우 — 버튼을 다시 누르면 된다
    }
  }

  pause(): void {
    this.video?.pause();
    this.range = null;
  }

  toggle(): void {
    if (this.isPlaying()) this.pause();
    else void this.play();
  }

  seek(ms: number): void {
    if (!this.video) return;
    const dur = Number.isFinite(this.video.duration) ? this.video.duration * 1000 : ms;
    this.video.currentTime = Math.max(0, Math.min(ms, dur)) / 1000;
  }

  /** 컷 구간 미리듣기: 잘린 소리까지 그대로 들려주고 구간 끝에서 멈춘다 */
  playRange(startMs: number, endMs: number): void {
    this.range = { startMs, endMs, skipCuts: false, loop: false, clipId: null };
    this.seek(startMs);
    void this.play();
  }

  /** 클립 미리듣기: 지운 단어가 실제로 건너뛰어진 소리로, 구간을 반복 재생한다 (F-01-5) */
  playClip(clipId: string, startMs: number, endMs: number): void {
    this.range = { startMs, endMs, skipCuts: true, loop: true, clipId };
    this.seek(startMs);
    void this.play();
  }

  /** rAF 루프에서 호출. 구간 끝에 도달하면 반복하거나 멈추고 true */
  checkRangeEnd(ms: number): boolean {
    const r = this.range;
    if (!r || ms < r.endMs) return false;
    if (!r.loop) {
      this.pause();
      return true;
    }
    this.seek(r.startMs);
    return true;
  }

  /** 재생 중 잘린 구간을 건너뛸지 — 컷 구간 확인 중에만 끈다 */
  get skipsCuts(): boolean {
    return this.range === null || this.range.skipCuts;
  }

  get previewingClipId(): string | null {
    return this.range?.clipId ?? null;
  }
}

export const player = new Player();
