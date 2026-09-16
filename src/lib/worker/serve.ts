// 워커 쪽 규약 구현. 각 워커는 핸들러만 정의하고, 취소·진행률·에러 직렬화는 여기서 일괄 처리한다.
import { toAppError } from '@/lib/errors';
import { CANCEL_TYPE, type Progress, type WorkerApi, type WorkerRequest, type WorkerResponse } from './protocol';

interface WorkerScope {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void;
}

export interface HandlerContext {
  signal: AbortSignal;
  progress: (p: Progress) => void;
}

export interface HandlerResult<R> {
  result: R;
  transfer?: Transferable[];
}

export type Handlers<Api extends WorkerApi> = {
  [K in keyof Api]: (payload: Api[K]['payload'], ctx: HandlerContext) => Promise<HandlerResult<Api[K]['result']>>;
};

export function serve<Api extends WorkerApi>(handlers: Handlers<Api>): void {
  const scope = globalThis as unknown as WorkerScope;
  const running = new Map<string, AbortController>();
  const post = (msg: WorkerResponse, transfer: Transferable[] = []) => scope.postMessage(msg, transfer);

  scope.addEventListener('message', async (e: MessageEvent) => {
    const req = e.data as WorkerRequest;
    if (!req || typeof req.id !== 'string') return;
    if (req.type === CANCEL_TYPE) {
      running.get(req.id)?.abort();
      return;
    }
    const handler = (handlers as Record<string, Handlers<WorkerApi>[string]>)[req.type];
    if (!handler) {
      post({ id: req.id, status: 'error', error: { code: 'UNKNOWN', message: `알 수 없는 작업: ${req.type}`, hint: '새로고침 후 다시 시도해 주세요.' } });
      return;
    }
    const controller = new AbortController();
    running.set(req.id, controller);
    // 진행률 메시지가 초당 수백 번 나가면 메인 스레드가 오히려 바빠지므로 약 15fps로 제한
    let lastProgress = 0;
    const progress = (p: Progress) => {
      const now = Date.now();
      if (now - lastProgress < 66 && p.done < p.total) return;
      lastProgress = now;
      post({ id: req.id, status: 'progress', progress: p });
    };
    try {
      const { result, transfer } = await handler(req.payload, { signal: controller.signal, progress });
      post({ id: req.id, status: 'done', result }, transfer);
    } catch (err) {
      post({ id: req.id, status: 'error', error: toAppError(err).toJSON() });
    } finally {
      running.delete(req.id);
    }
  });
}
