// localStorage 설정. 아주 작고 동기 접근이 필요한 값만 (ERD 1장). BYOK 키는 이 브라우저 밖으로 나가지 않는다.
import { DEFAULT_SILENCE_PARAMS, type SilenceParams } from '@/lib/audio/silence';
import { DEFAULT_FILLERS, type FillerEntry } from '@/lib/stt/fillers';

const PREFIX = 'editon.';

function read<T>(key: string, fallback: T, guard: (v: unknown) => v is T): T {
  if (typeof localStorage === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (value === undefined || value === null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('editon-settings', { detail: key }));
  } catch {
    // 시크릿 모드 등에서 저장 실패 — 설정은 이번 세션만 유지된다
  }
}

const isString = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isFillers = (v: unknown): v is FillerEntry[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'object' && x !== null && isString((x as FillerEntry).word) && isBool((x as FillerEntry).enabled));
const isSilence = (v: unknown): v is SilenceParams =>
  typeof v === 'object' && v !== null && ['thresholdDb', 'minSilenceMs', 'paddingMs', 'minKeepMs'].every((k) => typeof (v as Record<string, unknown>)[k] === 'number');

export type EncoderPreference = 'auto' | 'webcodecs' | 'ffmpeg-wasm';
export type SttEnginePreference = 'local-whisper' | 'groq';

export const settings = {
  getGroqKey: () => read('byok.groq', '', isString),
  setGroqKey: (key: string) => write('byok.groq', key.trim() || null),
  getSttEngine: () => read<SttEnginePreference>('stt.engine', 'local-whisper', (v): v is SttEnginePreference => v === 'local-whisper' || v === 'groq'),
  setSttEngine: (v: SttEnginePreference) => write('stt.engine', v),
  getFillers: () => read('fillers', DEFAULT_FILLERS, isFillers),
  setFillers: (v: FillerEntry[]) => {
    write('fillers', v);
    // 기기 간 동기화에서 "어느 쪽이 최신인지" 판단하기 위한 시각
    write('fillers.updatedAt', Date.now());
  },
  getFillersUpdatedAt: () => read('fillers.updatedAt', 0, (v): v is number => typeof v === 'number'),
  setFillersFromRemote: (v: FillerEntry[], updatedAt: number) => {
    write('fillers', v);
    write('fillers.updatedAt', updatedAt);
  },
  getSilenceParams: () => read('silence.params', DEFAULT_SILENCE_PARAMS, isSilence),
  setSilenceParams: (v: SilenceParams) => write('silence.params', v),
  getEncoder: () => read<EncoderPreference>('export.encoder', 'auto', (v): v is EncoderPreference => v === 'auto' || v === 'webcodecs' || v === 'ffmpeg-wasm'),
  setEncoder: (v: EncoderPreference) => write('export.encoder', v),
  getExportPreset: () => read('export.preset', 'youtube-1080p', isString),
  setExportPreset: (v: string) => write('export.preset', v),
  getLastPresetId: () => read('style.lastPresetId', '', isString),
  setLastPresetId: (v: string) => write('style.lastPresetId', v),
  getOnboarded: () => read('onboarded', false, isBool),
  setOnboarded: (v: boolean) => write('onboarded', v),
};
