import { describe, expect, it } from 'vitest';
import { downloadTotals, transcribeRatio } from '@/lib/stt/localWhisper';
import { overallRatio, remainingMs, stageStatus, sttStage, type StageDef } from './stages';

const STAGES: StageDef[] = [
  { id: 'audio', label: '소리 꺼내기', weight: 10 },
  { id: 'model', label: '모델 준비', weight: 20 },
  { id: 'transcribe', label: '글자로 바꾸기', weight: 70 },
];

describe('overallRatio', () => {
  it('앞 단계 무게 + 지금 단계 안의 진행', () => {
    expect(overallRatio(STAGES, { stageId: 'audio', ratio: 0.5 })).toBeCloseTo(0.05, 5);
    expect(overallRatio(STAGES, { stageId: 'model', ratio: 0.5 })).toBeCloseTo(0.2, 5);
    expect(overallRatio(STAGES, { stageId: 'transcribe', ratio: 0.5 })).toBeCloseTo(0.65, 5);
  });
  it('끝나기 전에는 99%를 넘기지 않고, 끝나면 100%', () => {
    expect(overallRatio(STAGES, { stageId: 'transcribe', ratio: 1 })).toBe(0.99);
    expect(overallRatio(STAGES, { stageId: 'transcribe', ratio: 1 }, true)).toBe(1);
  });
  it('비율을 모르는 단계는 그 단계 시작점에 머문다', () => {
    expect(overallRatio(STAGES, { stageId: 'model' })).toBeCloseTo(0.1, 5);
    expect(overallRatio(STAGES, null)).toBe(0);
  });
});

describe('stageStatus', () => {
  it('지난 단계는 완료, 지금은 진행 중, 뒤는 대기', () => {
    const run = { stageId: 'model', ratio: 0.3 };
    expect(stageStatus(STAGES, run, 'audio')).toBe('done');
    expect(stageStatus(STAGES, run, 'model')).toBe('active');
    expect(stageStatus(STAGES, run, 'transcribe')).toBe('pending');
    expect(stageStatus(STAGES, run, 'transcribe', true)).toBe('done');
  });
  it('건너뛴 단계 (이미 받은 모델)', () => {
    expect(stageStatus(STAGES, { stageId: 'transcribe', skipped: ['model'] }, 'model')).toBe('skipped');
  });
});

describe('sttStage', () => {
  it('워커 메시지를 단계로 바꾼다', () => {
    expect(sttStage({ phase: 'decode', done: 500, total: 1000 }).stageId).toBe('audio');
    expect(sttStage({ phase: 'download', done: 10, total: 100 })).toMatchObject({ stageId: 'model', ratio: 0.1 });
    const t = sttStage({ phase: 'transcribe', done: 250, total: 1000, detail: { chunk: 2, chunks: 8, text: '안녕하세요' } });
    expect(t).toMatchObject({ stageId: 'transcribe', ratio: 0.25 });
    expect(t.detail?.text).toBe('안녕하세요');
  });
});

describe('remainingMs', () => {
  it('초반이거나 끝났으면 모른다고 한다', () => {
    expect(remainingMs(0, 0.01, 10_000)).toBeUndefined();
    expect(remainingMs(9000, 0.5, 10_000)).toBeUndefined(); // 3초도 안 지남
    expect(remainingMs(0, 1, 10_000)).toBeUndefined();
  });
  it('경과 시간과 비율로 어림한다', () => {
    expect(remainingMs(0, 0.25, 20_000)).toBe(60_000);
  });
});

describe('음성 인식 진행 (localWhisper)', () => {
  it('구간이 끝나야만 오르지 않고, 알아들은 토큰만큼 조금씩 오른다', () => {
    expect(transcribeRatio(0, 4, 0)).toBe(0);
    expect(transcribeRatio(0, 4, 40)).toBeCloseTo(0.125, 5);
    // 구간 끝 직전에서 멈추고 다음 구간을 넘어가지 않는다
    expect(transcribeRatio(0, 4, 1000)).toBeCloseTo(0.2375, 5);
    expect(transcribeRatio(3, 4, 1000)).toBeLessThan(1);
  });

  it('서버가 파일 크기를 안 알려 줘도 모델 크기 어림값으로 내려받기 비율을 만든다', () => {
    const unknown = downloadTotals([{ loaded: 40, total: 0 }], 100);
    expect(unknown).toEqual({ loaded: 40, total: 100 });
    const known = downloadTotals([{ loaded: 40, total: 80 }, { loaded: 5, total: 20 }], 100);
    expect(known).toEqual({ loaded: 45, total: 100 });
    // 어림값보다 더 받아도 100%를 찍지 않는다
    const over = downloadTotals([{ loaded: 150, total: 0 }], 100);
    expect(over.loaded / over.total).toBeLessThan(1);
  });

  it('작은 설정 파일이 먼저 다 받아져도 100%로 튀었다가 떨어지지 않는다', () => {
    // 실제로 본 버그: config.json(2KB)만 받았을 때 100% → 인코더(80MB) 시작 시 5%
    const configOnly = downloadTotals([{ loaded: 2, total: 2 }], 100);
    const encoderStarted = downloadTotals([{ loaded: 2, total: 2 }, { loaded: 3, total: 80 }], 100);
    const r1 = configOnly.loaded / configOnly.total;
    const r2 = encoderStarted.loaded / encoderStarted.total;
    expect(r1).toBeLessThan(0.05);
    expect(r2).toBeGreaterThanOrEqual(r1);
  });
});
