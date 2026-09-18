// 자막 생성 오케스트레이션: PCM 캐시 확인 → STT 워커 호출.
import type { MediaAsset, Project } from '@/types/models';
import { AppError } from '@/lib/errors';
import { settings, type SttEnginePreference } from '@/lib/settings';
import { fileExists, paths } from '@/lib/storage/opfs';
import type { SttResult } from '@/lib/stt/types';
import { sttWorker } from '@/lib/worker/instances';
import type { Progress } from '@/lib/worker/protocol';
import { analyzeAudio } from './importPipeline';

export async function ensurePcm(project: Project, asset: MediaAsset, source: Blob, signal?: AbortSignal): Promise<string> {
  const path = paths.pcm(project.id, asset.id);
  if (await fileExists(path)) return path;
  const peaks = await analyzeAudio(project.id, asset, source, () => undefined, signal);
  if (!peaks) throw new AppError('NO_AUDIO_TRACK');
  return path;
}

export async function transcribeProject(args: {
  project: Project;
  asset: MediaAsset;
  source: Blob;
  engine: SttEnginePreference;
  language: string;
  /** 브라우저 내장 Whisper 모델 (크기 선택). 없으면 기본(base) */
  model?: string;
  onProgress: (p: Progress) => void;
  signal: AbortSignal;
}): Promise<SttResult> {
  const apiKey = args.engine === 'groq' ? settings.getGroqKey() : undefined;
  if (args.engine === 'groq' && !apiKey) {
    throw new AppError('API_KEY_INVALID', 'Groq API 키가 없습니다.', '설정 > 음성 인식에서 키를 넣거나 "브라우저 내장"을 선택해 주세요.');
  }
  args.onProgress({ phase: 'analyze', done: 0, total: 1, message: '오디오 준비 중' });
  const pcmPath = await ensurePcm(args.project, args.asset, args.source, args.signal);
  return sttWorker().call('transcribe', { engine: args.engine, pcmPath, language: args.language, apiKey, model: args.model }, { onProgress: args.onProgress, signal: args.signal });
}
