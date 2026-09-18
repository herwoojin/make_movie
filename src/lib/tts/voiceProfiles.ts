// 감정별 참조 음성 (F-08). 감정은 프롬프트가 아니라 "그 감정으로 녹음해 둔 샘플"이다.
import type { VoiceEmotion, VoiceProfile } from '@/types/models';
import { getDb } from '@/lib/storage/db';
import { deleteFile, readFile, writeFile } from '@/lib/storage/opfs';

export const EMOTIONS: { id: VoiceEmotion; label: string }[] = [
  { id: 'default', label: '기본' },
  { id: 'calm', label: '차분하게' },
  { id: 'bright', label: '밝게' },
  { id: 'serious', label: '진지하게' },
  { id: 'sad', label: '슬프게' },
  { id: 'emphatic', label: '강조해서' },
];

export const DEFAULT_REF_TEXT =
  '제 목소리로 자연스러운 나레이션을 만드는 과정을 소개하겠습니다. '
  + '너무 빠르거나 힘을 주어 읽지 않고, 평소 대화하듯 또렷하게 이야기합니다.';

export function emotionLabel(emotion: VoiceEmotion): string {
  return EMOTIONS.find((e) => e.id === emotion)?.label ?? emotion;
}

const pathFor = (emotion: VoiceEmotion) => `voices/${emotion}.wav`;

export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  return getDb().voiceProfiles.toArray();
}

export async function saveVoiceProfile(
  emotion: VoiceEmotion, wav: Blob, refText: string, durationMs: number, sampleRate: number,
): Promise<VoiceProfile> {
  const opfsPath = pathFor(emotion);
  await writeFile(opfsPath, wav);
  const row: VoiceProfile = {
    id: `voice-${emotion}`, emotion, label: emotionLabel(emotion), opfsPath, refText, sampleRate, durationMs, updatedAt: Date.now(),
  };
  await getDb().voiceProfiles.put(row);
  return row;
}

export async function deleteVoiceProfile(emotion: VoiceEmotion): Promise<void> {
  await deleteFile(pathFor(emotion)).catch(() => undefined);
  await getDb().voiceProfiles.delete(`voice-${emotion}`);
}

export async function readVoiceProfile(profile: VoiceProfile): Promise<File | null> {
  return readFile(profile.opfsPath).catch(() => null);
}
