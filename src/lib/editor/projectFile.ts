// .editon.json 불러오기 (ERD 6.5). 영상은 들어 있지 않으므로 원본을 다시 선택받아 크기·길이로 같은 파일인지 확인한다.
import type { EditorDoc } from '@/types/editor';
import { createHistory } from '@/lib/core/undo';
import { AppError } from '@/lib/errors';
import { probeMedia } from '@/lib/media/probeClient';
import { isSameSource, loadProjectBundle, parseProjectFile, saveImportedWords, saveProjectDoc } from '@/lib/storage/projectRepo';
import { formatBytes } from '@/lib/utils';
import { createProjectFromFile, type ImportProgress } from './importPipeline';

export async function importEditonProject(json: unknown, video: File, onProgress: (p: ImportProgress) => void): Promise<string> {
  const file = parseProjectFile(json);
  const original = file.assets[0];
  if (video.size !== original.fileSize) {
    const probe = await probeMedia(video);
    if (!isSameSource(original, video, probe.durationMs)) {
      throw new AppError('UNSUPPORTED_FORMAT', '선택한 영상이 프로젝트의 원본과 다릅니다.', `"${original.fileName}" (${formatBytes(original.fileSize)}) 파일을 선택해 주세요.`);
    }
  }
  const { projectId } = await createProjectFromFile(video, onProgress);
  const bundle = await loadProjectBundle(projectId);
  const assetId = bundle.asset.id;
  // 같은 파일을 두 번 불러와도 기본키가 겹치지 않도록 id에 새 프로젝트 id를 붙인다
  const pid = (id: string) => `${projectId}-${id}`;
  const doc: EditorDoc = {
    edl: file.edlSegments.map((s) => ({ ...s, id: pid(s.id), projectId, assetId })),
    clips: file.clips.map((c) => ({ ...c, id: pid(c.id), projectId })),
    words: file.words.map((w) => ({ ...w, id: pid(w.id), clipId: pid(w.clipId) })),
    view: file.view,
    style: { ...file.subtitleStyle, id: `style-${projectId}`, projectId },
    tracks: file.mosaicTracks.map(({ track, keyframes }) => {
      const trackId = pid(track.id);
      return { ...track, id: trackId, projectId, keyframes: keyframes.map((k) => ({ ...k, id: pid(k.id), trackId })) };
    }),
  };
  // 단어는 transcript에 매달려 있으므로 새 프로젝트용 transcript를 만들어 붙인다
  if (doc.words.length) {
    const transcript = await saveImportedWords(projectId, doc.words.map((w) => ({ ...w, transcriptId: `tr-${projectId}` })));
    doc.words = doc.words.map((w) => ({ ...w, transcriptId: transcript.id }));
  }
  await saveProjectDoc({ ...bundle.project, name: file.project.name }, doc, [], createHistory());
  return projectId;
}
