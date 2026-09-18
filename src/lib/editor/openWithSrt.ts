// F-02-3 "영상 + SRT 열기": 1단계를 건너뛰고 외부 영상 + 자막 파일로 2단계를 시작한다.
import { renumberClips } from '@/lib/core/clips';
import { AppError } from '@/lib/errors';
import { getDb } from '@/lib/storage/db';
import { saveImportedWords } from '@/lib/storage/projectRepo';
import { cuesToClips } from '@/lib/subtitle/clipCues';
import { parseSubtitles } from '@/lib/subtitle/srt';
import { createProjectFromFile, type ImportProgress } from './importPipeline';

export async function createProjectFromVideoAndSrt(
  video: File, subtitle: File, onProgress: (p: ImportProgress) => void, signal?: AbortSignal,
): Promise<{ projectId: string; clipCount: number }> {
  // 자막을 먼저 읽는다 — 영상 복사(수십 초)를 하고 나서 실패하면 시간이 아깝다
  const parsed = parseSubtitles(await subtitle.text());
  if (parsed.length === 0) {
    throw new AppError('UNSUPPORTED_FORMAT', '자막 파일을 읽지 못했습니다.', 'SRT 또는 VTT 형식인지 확인해 주세요.');
  }

  const { projectId } = await createProjectFromFile(video, onProgress, signal, { sourceTool: 'import', pipelineStage: 2 });
  const { clips, words } = cuesToClips(parsed, projectId);
  const transcript = await saveImportedWords(projectId, words);
  const db = getDb();
  await db.editClips.bulkPut(renumberClips(clips));
  await db.transcriptWords.bulkPut(words.map((w) => ({ ...w, transcriptId: transcript.id })));
  await db.projects.update(projectId, { pipelineStage: 2 });
  return { projectId, clipCount: clips.length };
}
