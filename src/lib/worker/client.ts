// 메인 스레드 쪽 규약 구현. 요청마다 Promise를 돌려주고, AbortSignal을 워커 취소 메시지로 연결한다.
import { AppError } from '@/lib/errors';
import { CANCEL_TYPE, type Progress, type WorkerApi, type WorkerResponse } from './protocol';

export interface CallOptions {
  transfer?: Transferable[];
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: unknown) => void;
  onProgress?: (p: Progress) => void;
}

let seq = 0;

export class WorkerClient<Api extends WorkerApi> {
  private readonly pending = new Map<string, Pending>();

  constructor(private readonly worker: Worker, private readonly name: string) {
    worker.addEventListener('message', (e: MessageEvent<WorkerResponse>) => this.onMessage(e.data));
    worker.addEventListener('error', (e) => {
      const err = new AppError('UNKNOWN', `${name} 작업자에서 오류가 났습니다. (${e.message || '원인 불명'})`);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
    });
  }

  call<K extends keyof Api & string>(type: K, payload: Api[K]['payload'], opts: CallOptions = {}): Promise<Api[K]['result']> {
    const id = `${this.name}-${++seq}`;
    return new Promise<Api[K]['result']>((resolve, reject) => {
      if (opts.signal?.aborted) {
        reject(new AppError('ABORTED'));
        return;
      }
      const onAbort = () => {
        this.worker.postMessage({ id, type: CANCEL_TYPE, payload: null });
        // 워커가 협조적으로 멈추지 않더라도 UI는 즉시 풀려야 한다
        this.pending.delete(id);
        reject(new AppError('ABORTED'));
      };
      opts.signal?.addEventListener('abort', onAbort, { once: true });
      this.pending.set(id, {
        resolve: (v) => { opts.signal?.removeEventListener('abort', onAbort); resolve(v as Api[K]['result']); },
        reject: (e) => { opts.signal?.removeEventListener('abort', onAbort); reject(e); },
        onProgress: opts.onProgress,
      });
      this.worker.postMessage({ id, type, payload }, opts.transfer ?? []);
    });
  }

  private onMessage(msg: WorkerResponse): void {
    const p = this.pending.get(msg.id);
    if (!p) return;
    if (msg.status === 'progress') {
      p.onProgress?.(msg.progress);
      return;
    }
    this.pending.delete(msg.id);
    if (msg.status === 'done') p.resolve(msg.result);
    else p.reject(new AppError(msg.error.code, msg.error.message, msg.error.hint));
  }

  terminate(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new AppError('ABORTED'));
    this.pending.clear();
  }
}
