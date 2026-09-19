// IndexedDB 스키마 (ERD 3장 + v2 증분). 바이너리는 OPFS, 여기는 편집 데이터(수 MB 수준)만.
import Dexie, { type Table } from 'dexie';
import type {
  CutSuggestion, EdlSegment, EditClip, ExportJob, Glossary, HistoryEntry, MediaAsset, MosaicKeyframe, MosaicTrack,
  Project, SavedResult, StylePresetRecord, SubtitleCue, SubtitleStyle, Thumbnail, Transcript, TranscriptWord,
  VoiceProfile, Waveform,
} from '@/types/models';
import { currentOwnerSync, LEGACY } from './owner';

export type * from '@/types/models';

/** 저장 폴더 권한 (사용자가 한 번 고르면 다음부터 그 폴더로 바로 저장한다) */
export interface FsHandleRecord {
  id: string;
  handle: FileSystemDirectoryHandle;
  name: string;
  updatedAt: number;
}

export const SCHEMA_VERSION = 3;

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
  // ── v2 ──────────────────────────────────────────────
  editClips!: Table<EditClip, string>;
  savedResults!: Table<SavedResult, string>;
  voiceProfiles!: Table<VoiceProfile, string>;
  glossaries!: Table<Glossary, string>;
  /** 저장 폴더 권한 핸들 (File System Access API). 값은 구조화 복제로 그대로 보관된다 */
  fsHandles!: Table<FsHandleRecord, string>;

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

    // v2: 단어 칩 편집(EditClip) · 최근 저장 결과 · 음성 프로필 · 용어집
    this.version(2).stores({
      transcriptWords: 'id, transcriptId, [transcriptId+idx], startMs, isFiller, clipId',
      editClips: 'id, projectId, [projectId+idx], enabled',
      savedResults: 'id, createdAt, kind, toolId',
      voiceProfiles: 'id, emotion, updatedAt',
      glossaries: 'id, updatedAt',
    }).upgrade(async (tx) => {
      await tx.table('projects').toCollection().modify((p: Project) => {
        p.aspectMode ??= 'original';
        p.reframe ??= { x: 0.5, y: 0.5, scale: 1 };
        p.fillMode ??= 'blur';
        p.globalSpeed ??= 1;
        p.pitchPreserve ??= true;
        p.pipelineStage ??= 2;
        p.sourceTool ??= 'import';
        p.schemaVersion = 2;
      });
      await tx.table('subtitleStyles').toCollection().modify((s: SubtitleStyle) => {
        s.italic ??= false;
        s.outlineEnabled ??= s.outlineWidth > 0;
        s.bgEnabled ??= s.bgOpacity > 0;
      });
      await tx.table('transcriptWords').toCollection().modify((w: TranscriptWord) => {
        w.clipId ??= '';
        w.deleted ??= false;
      });
      // v1의 자막 큐를 v2 편집 클립으로 옮긴다 (SubtitleCue는 이후 SRT 입출력 중간 표현으로만 쓴다)
      const cues = (await tx.table('subtitleCues').toArray()) as SubtitleCue[];
      if (cues.length > 0) {
        const byProject = new Map<string, SubtitleCue[]>();
        for (const cue of cues) {
          const list = byProject.get(cue.projectId) ?? [];
          list.push(cue);
          byProject.set(cue.projectId, list);
        }
        const clips: EditClip[] = [];
        for (const [projectId, list] of byProject) {
          list.sort((a, b) => a.sourceStartMs - b.sourceStartMs);
          list.forEach((cue, idx) => {
            clips.push({
              id: `clip-${cue.id}`,
              projectId,
              idx,
              sourceKind: 'video-edit',
              sourceStartMs: cue.sourceStartMs,
              sourceEndMs: cue.sourceEndMs,
              captionText: cue.text,
              captionTextOriginal: cue.text,
              captionEdited: false,
              enabled: !cue.orphan,
              speed: 1,
              ...(cue.styleOverride ? { styleOverride: cue.styleOverride } : {}),
            });
          });
        }
        await tx.table('editClips').bulkAdd(clips);
      }
    });

    // v3: 저장 폴더 권한 핸들 보관 (F-11 3단계 저장)
    this.version(3).stores({ fsHandles: 'id' });

    // v4: 계정별로 나눠 보여 주기. 이전에 만든 작업은 주인을 모르므로 'legacy' — 이 브라우저에서 로그인한 계정이 가져간다
    this.version(4).stores({
      projects: 'id, updatedAt, status, ownerUid',
      savedResults: 'id, createdAt, kind, toolId, ownerUid',
      voiceProfiles: 'id, emotion, updatedAt, ownerUid',
    }).upgrade(async (tx) => {
      for (const table of ['projects', 'savedResults', 'voiceProfiles']) {
        await tx.table(table).toCollection().modify((row: { ownerUid?: string }) => {
          if (!row.ownerUid) row.ownerUid = LEGACY;
        });
      }
    });

    // 어느 경로로 만들든 주인이 비지 않게 한다 (만드는 쪽이 먼저 정했으면 그대로)
    const stamp = (_key: unknown, row: { ownerUid?: string }) => {
      if (!row.ownerUid) row.ownerUid = currentOwnerSync();
    };
    this.projects.hook('creating', stamp);
    this.savedResults.hook('creating', stamp);
    this.voiceProfiles.hook('creating', stamp);
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
      db.editClips.where('projectId').equals(projectId).delete(),
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
