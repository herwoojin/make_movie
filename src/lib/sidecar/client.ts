// 내 컴퓨터 도우미(사이드카) 클라이언트.
// 규칙: 주소는 127.0.0.1 고정, 토큰 없는 요청 금지, 연결 실패는 조용히 웹 전용 모드로 (에러 팝업 금지).
import { AppError } from '@/lib/errors';
import { settings } from '@/lib/settings';

export const SIDECAR_ORIGIN = 'http://127.0.0.1:47600';

export interface SidecarFeatures {
  ytdlp: boolean;
  ffmpeg: boolean;
  translate: boolean;
  tts: boolean;
}

export interface SidecarHealth {
  ok: boolean;
  version: string;
  features: SidecarFeatures;
  models?: { translate?: string[]; tts?: string[] };
}

export type SidecarStatus = 'unknown' | 'checking' | 'connected' | 'offline';

const NO_FEATURES: SidecarFeatures = { ytdlp: false, ffmpeg: false, translate: false, tts: false };

type Listener = () => void;

export interface TranslateSidecarRequest {
  cues: { start: number; end: number; text: string }[];
  sourceLang: string;
  targetLang: 'ko';
  tone: string;
  glossary: Record<string, string>;
  mode: 'fast' | 'precise';
}

export interface YoutubeDownloadResult {
  filePath: string;
  title: string;
  durationMs: number;
  width?: number;
  height?: number;
}

class SidecarClient {
  private statusValue: SidecarStatus = 'unknown';
  private healthValue: SidecarHealth | null = null;
  private listeners = new Set<Listener>();
  private checking: Promise<SidecarHealth | null> | null = null;

  get status(): SidecarStatus {
    return this.statusValue;
  }

  get health(): SidecarHealth | null {
    return this.healthValue;
  }

  features(): SidecarFeatures {
    return this.healthValue?.features ?? NO_FEATURES;
  }

  isReady(): boolean {
    return this.statusValue === 'connected';
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(status: SidecarStatus, health: SidecarHealth | null): void {
    this.statusValue = status;
    this.healthValue = health;
    this.listeners.forEach((l) => l());
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    const token = settings.getSidecarToken();
    return token ? { ...extra, authorization: `Bearer ${token}` } : extra;
  }

  /** 시작할 때 한 번. 실패해도 조용히 웹 전용으로 간다 */
  async check(force = false): Promise<SidecarHealth | null> {
    if (!force && this.statusValue === 'connected' && this.healthValue) return this.healthValue;
    if (this.checking) return this.checking;
    this.emit('checking', this.healthValue);
    this.checking = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1500);
        const res = await fetch(`${SIDECAR_ORIGIN}/health`, { headers: this.headers(), signal: controller.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(String(res.status));
        const health = (await res.json()) as SidecarHealth;
        this.emit('connected', health);
        return health;
      } catch {
        this.emit('offline', null);
        return null;
      } finally {
        this.checking = null;
      }
    })();
    return this.checking;
  }

  private async post<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${SIDECAR_ORIGIN}${path}`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json' }),
      body: JSON.stringify(body),
      signal,
    });
    if (res.status === 401) throw new AppError('API_KEY_INVALID', '내 컴퓨터 도우미 토큰이 맞지 않습니다.', '설정 화면에서 도우미가 보여 준 토큰을 다시 붙여넣어 주세요.');
    if (!res.ok) throw new AppError('UNKNOWN', `내 컴퓨터 도우미가 실패했습니다 (${res.status}).`, '도우미 창의 메시지를 확인해 주세요.');
    return (await res.json()) as T;
  }

  /** 진행률을 SSE로 흘려보내고 마지막에 결과를 주는 요청 */
  private async postStream<T>(
    path: string, body: unknown, onProgress?: (done: number, total: number, message?: string) => void, signal?: AbortSignal,
  ): Promise<T> {
    const res = await fetch(`${SIDECAR_ORIGIN}${path}`, {
      method: 'POST',
      headers: this.headers({ 'content-type': 'application/json', accept: 'text/event-stream' }),
      body: JSON.stringify(body),
      signal,
    });
    if (res.status === 401) throw new AppError('API_KEY_INVALID', '내 컴퓨터 도우미 토큰이 맞지 않습니다.', '설정 화면에서 토큰을 다시 붙여넣어 주세요.');
    if (!res.ok || !res.body) throw new AppError('UNKNOWN', `내 컴퓨터 도우미가 실패했습니다 (${res.status}).`, '도우미 창의 메시지를 확인해 주세요.');

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = '';
    let result: T | null = null;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const text = line.startsWith('data:') ? line.slice(5).trim() : line.trim();
        if (!text) continue;
        try {
          const event = JSON.parse(text) as { type?: string; done?: number; total?: number; message?: string; result?: T };
          if (event.type === 'progress') onProgress?.(event.done ?? 0, event.total ?? 0, event.message);
          else if (event.type === 'result') result = (event.result ?? (event as unknown as T));
        } catch {
          // 사람이 읽는 로그 줄 — 무시한다
        }
      }
    }
    if (result === null) throw new AppError('UNKNOWN', '내 컴퓨터 도우미가 결과를 주지 않았습니다.', '도우미 창의 메시지를 확인해 주세요.');
    return result;
  }

  translate(
    req: TranslateSidecarRequest, onProgress?: (done: number, total: number, message?: string) => void, signal?: AbortSignal,
  ): Promise<{ start: number; end: number; text: string; translated: string }[]> {
    return this.postStream('/translate', req, onProgress, signal);
  }

  downloadYoutube(
    req: { url: string; quality: string; outDir?: string }, onProgress?: (done: number, total: number, message?: string) => void, signal?: AbortSignal,
  ): Promise<YoutubeDownloadResult> {
    return this.postStream('/youtube/download', req, onProgress, signal);
  }

  generateTts(
    req: { text: string; refAudioPath?: string; refText?: string; emotion?: string },
    onProgress?: (done: number, total: number, message?: string) => void, signal?: AbortSignal,
  ): Promise<{ wavPath: string }> {
    return this.postStream('/tts/generate', req, onProgress, signal);
  }

  pickFolder(): Promise<{ path: string }> {
    return this.post('/fs/pick-folder', {});
  }

  openFolder(path?: string): Promise<{ ok: boolean }> {
    return this.post('/fs/open-folder', { path: path ?? settings.getSidecarFolder() });
  }

  /** 브라우저가 만든 파일을 도우미에게 넘겨 지정한 폴더에 저장한다 */
  async saveFile(blob: Blob, fileName: string, dir?: string): Promise<string> {
    const form = new FormData();
    form.set('file', blob, fileName);
    form.set('dir', dir ?? settings.getSidecarFolder());
    const res = await fetch(`${SIDECAR_ORIGIN}/fs/save`, { method: 'POST', headers: this.headers(), body: form });
    if (!res.ok) throw new AppError('STORAGE_FAILED', '내 컴퓨터 도우미가 파일을 저장하지 못했습니다.', '폴더 권한을 확인하거나 다른 폴더를 골라 주세요.');
    const json = (await res.json()) as { path?: string };
    return json.path ?? fileName;
  }
}

export const sidecar = new SidecarClient();
