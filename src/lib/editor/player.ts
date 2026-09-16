// <video> 요소를 재생 시계로 쓰는 얇은 컨트롤러. 컴포넌트 여러 곳(단축키, 타임라인, 목록의 미리듣기)이
// 같은 video를 제어해야 해서 React 트리 밖 싱글턴으로 둔다.

class Player {
  private video: HTMLVideoElement | null = null;
  private rangeEndMs: number | null = null;

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
    this.rangeEndMs = null;
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

  /** 컷 구간 미리듣기: 지정 구간만 재생하고 멈춘다 */
  playRange(startMs: number, endMs: number): void {
    this.seek(startMs);
    this.rangeEndMs = endMs;
    void this.play();
  }

  /** rAF 루프에서 호출. 구간 미리듣기 끝에 도달하면 멈추고 true */
  checkRangeEnd(ms: number): boolean {
    if (this.rangeEndMs !== null && ms >= this.rangeEndMs) {
      this.pause();
      return true;
    }
    return false;
  }

  get inRangePreview(): boolean {
    return this.rangeEndMs !== null;
  }
}

export const player = new Player();
