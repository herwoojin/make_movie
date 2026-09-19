// 감정별 참조 음성 (F-08). 감정은 프롬프트가 아니라 "그 감정으로 녹음해 둔 샘플"이다.
import type { VoiceEmotion, VoiceProfile } from '@/types/models';
import { getDb } from '@/lib/storage/db';
import { deleteFile, readFile, writeFile } from '@/lib/storage/opfs';
import { isVisible, ownerReady } from '@/lib/storage/owner';

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

// 내 목소리 녹음은 계정마다 따로 (같은 컴퓨터의 다른 사람이 내 목소리로 음성을 만들 수 없게)
const pathFor = (owner: string, emotion: VoiceEmotion) => `voices/${encodeURIComponent(owner)}/${emotion}.wav`;
const idFor = (owner: string, emotion: VoiceEmotion) => `voice-${owner}-${emotion}`;

export async function listVoiceProfiles(): Promise<VoiceProfile[]> {
  const owner = await ownerReady();
  return (await getDb().voiceProfiles.toArray()).filter((p) => isVisible(p.ownerUid, owner));
}

/** 이 계정의 그 감정 녹음 (계정을 나누기 전에 만든 것도 포함) */
async function ownedRows(emotion: VoiceEmotion): Promise<VoiceProfile[]> {
  return (await listVoiceProfiles()).filter((p) => p.emotion === emotion);
}

export async function saveVoiceProfile(
  emotion: VoiceEmotion, wav: Blob, refText: string, durationMs: number, sampleRate: number,
): Promise<VoiceProfile> {
  const owner = await ownerReady();
  const opfsPath = pathFor(owner, emotion);
  // 같은 감정의 예전 녹음(계정을 나누기 전 것 포함)은 새 녹음으로 바꾼다
  for (const old of await ownedRows(emotion)) {
    if (old.opfsPath !== opfsPath) await deleteFile(old.opfsPath).catch(() => undefined);
    await getDb().voiceProfiles.delete(old.id);
  }
  await writeFile(opfsPath, wav);
  const row: VoiceProfile = {
    id: idFor(owner, emotion), emotion, label: emotionLabel(emotion), opfsPath, refText, sampleRate, durationMs, updatedAt: Date.now(), ownerUid: owner,
  };
  await getDb().voiceProfiles.put(row);
  return row;
}

export async function deleteVoiceProfile(emotion: VoiceEmotion): Promise<void> {
  for (const row of await ownedRows(emotion)) {
    await deleteFile(row.opfsPath).catch(() => undefined);
    await getDb().voiceProfiles.delete(row.id);
  }
}

export async function readVoiceProfile(profile: VoiceProfile): Promise<File | null> {
  return readFile(profile.opfsPath).catch(() => null);
}
