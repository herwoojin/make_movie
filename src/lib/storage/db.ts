// IndexedDB 스키마 (ERD 3장). 바이너리는 OPFS, 여기는 편집 데이터(수 MB 수준)만.
import Dexie, { type Table } from 'dexie';
import type {
  CutSuggestion, EdlSegment, ExportJob, HistoryEntry, MediaAsset, MosaicKeyframe, MosaicTrack, Project,
  StylePresetRecord, SubtitleCue, SubtitleStyle, Thumbnail, Transcript, TranscriptWord, Waveform,
} from '@/types/models';

export type * from '@/types/models';

export const SCHEMA_VERSION = 1;

export class EditOnDB extends Dexie {
  projects!: Table<Project, string>;
  mediaAssets!: Table<MediaAsset, string>;
  edlSegments!: Table<EdlSegment, string>;
  cutSuggestions!: Table<CutSuggestion, string>;
  transcripts!: Table<Transcript, string>;
  transcriptWords!: Table<TranscriptWord, string>;
  subtitleCues!: Table<SubtitleCue, string>;
  subtitleStyles!: Table<SubtitleStyle, string>;
  mosaicTracks!: Table<MosaicTrack, string>;
  mosaicKeyframes!: Table<MosaicKeyframe, string>;
  waveforms!: Table<Waveform, string>;
  thumbnails!: Table<Thumbnail, string>;
  exportJobs!: Table<ExportJob, string>;
  history!: Table<HistoryEntry, string>;
  stylePresets!: Table<StylePresetRecord, string>;

  constructor(name = 'editon') {
    super(name);
    this.version(1).stores({
      projects: 'id, updatedAt, status',
      mediaAssets: 'id, projectId, kind',
      edlSegments: 'id, projectId, [projectId+order], enabled',
      cutSuggestions: 'id, projectId, [projectId+source], startMs, decision',
      transcripts: 'id, projectId',
      transcriptWords: 'id, transcriptId, [transcriptId+idx], startMs, isFiller',
      subtitleCues: 'id, projectId, [projectId+idx], startMs',
      subtitleStyles: 'id, projectId',
      mosaicTracks: 'id, projectId, enabled',
      mosaicKeyframes: 'id, trackId, [trackId+timeMs]',
      waveforms: 'id, assetId',
      thumbnails: 'id, assetId, [assetId+timeMs]',
      exportJobs: 'id, projectId, status, startedAt',
      history: 'id, projectId, [projectId+seq]',
      // ERD 외 추가: 로그인 없이도 쓰는 로컬 자막 스타일 프리셋
      stylePresets: 'id, updatedAt',
    });
  }
}

let instance: EditOnDB | null = null;

/** 서버 렌더링 중에는 IndexedDB가 없으므로 실제 사용 시점에 연다 */
export function getDb(): EditOnDB {
  if (!instance) instance = new EditOnDB();
  return instance;
}

/** 프로젝트에 딸린 레코드를 한 트랜잭션으로 삭제 (OPFS 삭제는 호출자가 이어서 수행) */
export async function deleteProjectRecords(db: EditOnDB, projectId: string): Promise<void> {
  const assets = await db.mediaAssets.where('projectId').equals(projectId).primaryKeys();
  const transcripts = await db.transcripts.where('projectId').equals(projectId).primaryKeys();
  const tracks = await db.mosaicTracks.where('projectId').equals(projectId).primaryKeys();
  await db.transaction('rw', db.tables, async () => {
    await Promise.all([
      db.projects.delete(projectId),
      db.mediaAssets.where('projectId').equals(projectId).delete(),
      db.edlSegments.where('projectId').equals(projectId).delete(),
      db.cutSuggestions.where('projectId').equals(projectId).delete(),
      db.transcripts.where('projectId').equals(projectId).delete(),
      db.subtitleCues.where('projectId').equals(projectId).delete(),
      db.subtitleStyles.where('projectId').equals(projectId).delete(),
      db.mosaicTracks.where('projectId').equals(projectId).delete(),
      db.exportJobs.where('projectId').equals(projectId).delete(),
      db.history.where('projectId').equals(projectId).delete(),
      transcripts.length ? db.transcriptWords.where('transcriptId').anyOf(transcripts).delete() : Promise.resolve(0),
      tracks.length ? db.mosaicKeyframes.where('trackId').anyOf(tracks).delete() : Promise.resolve(0),
      assets.length ? db.waveforms.where('assetId').anyOf(assets).delete() : Promise.resolve(0),
      assets.length ? db.thumbnails.where('assetId').anyOf(assets).delete() : Promise.resolve(0),
    ]);
  });
}
