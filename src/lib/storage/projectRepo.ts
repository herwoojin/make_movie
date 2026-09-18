// 프로젝트 영속화 (IndexedDB + OPFS). 스토어·화면은 이 모듈만 거쳐 저장소에 접근한다.
import { nanoid } from 'nanoid';
import type {
  CutSuggestion, EditClip, MediaAsset, Project, StyleValues, SubtitleStyle, Transcript, TranscriptWord,
} from '@/types/models';
import { DEFAULT_PROJECT_VIEW, type EditorDoc, type MosaicTrackDoc, type ProjectView } from '@/types/editor';
import { clipSpeedRanges } from '@/lib/core/clips';
import { outputDurationMs } from '@/lib/core/edl';
import type { UndoEntry, UndoHistory } from '@/lib/core/undo';
import { AppError } from '@/lib/errors';
import { matchFillers, type FillerEntry } from '@/lib/stt/fillers';
import type { SttWord } from '@/lib/stt/types';
import { DEFAULT_STYLE_VALUES } from '@/lib/subtitle/model';
import { deleteProjectRecords, getDb, SCHEMA_VERSION } from './db';
import { deleteDir, dirSize, listOrphans, paths, readFile } from './opfs';

export interface ProjectBundle {
  project: Project;
  asset: MediaAsset;
  doc: EditorDoc;
  suggestions: CutSuggestion[];
  peaks: Int8Array | null;
  transcript: Transcript | null;
  history: UndoEntry[];
}

export function defaultStyle(projectId: string, values: StyleValues = DEFAULT_STYLE_VALUES): SubtitleStyle {
  return { ...values, id: `style-${projectId}`, projectId };
}

export function projectView(project: Project): ProjectView {
  return {
    aspectMode: project.aspectMode ?? DEFAULT_PROJECT_VIEW.aspectMode,
    reframe: project.reframe ?? DEFAULT_PROJECT_VIEW.reframe,
    fillMode: project.fillMode ?? DEFAULT_PROJECT_VIEW.fillMode,
    globalSpeed: project.globalSpeed ?? DEFAULT_PROJECT_VIEW.globalSpeed,
    pitchPreserve: project.pitchPreserve ?? DEFAULT_PROJECT_VIEW.pitchPreserve,
  };
}

export async function listProjects(): Promise<Project[]> {
  return getDb().projects.orderBy('updatedAt').reverse().toArray();
}

export interface ProjectRow {
  project: Project;
  clipCount: number;
}

/** 프로젝트 고르기 화면용 — "N개 자막 클립"을 함께 보여준다 */
export async function listProjectRows(): Promise<ProjectRow[]> {
  const db = getDb();
  const projects = await listProjects();
  return Promise.all(projects.map(async (project) => ({
    project,
    clipCount: await db.editClips.where('projectId').equals(project.id).count(),
  })));
}

export async function setPipelineStage(projectId: string, pipelineStage: Project['pipelineStage']): Promise<void> {
  await getDb().projects.update(projectId, { pipelineStage, updatedAt: Date.now() });
}

export async function loadProjectBundle(projectId: string): Promise<ProjectBundle> {
  const db = getDb();
  const project = await db.projects.get(projectId);
  if (!project) throw new AppError('NOT_FOUND', '프로젝트를 찾을 수 없습니다.', '프로젝트 목록에서 다시 열거나 영상을 새로 올려 주세요.');
  const asset = await db.mediaAssets.where('projectId').equals(projectId).first();
  if (!asset) throw new AppError('NOT_FOUND', '프로젝트의 원본 정보가 없습니다.', '영상을 새로 올려 주세요.');

  const [edl, clips, styleRow, tracks, suggestions, waveform, transcript, history] = await Promise.all([
    db.edlSegments.where('[projectId+order]').between([projectId, -Infinity], [projectId, Infinity]).toArray(),
    db.editClips.where('[projectId+idx]').between([projectId, -Infinity], [projectId, Infinity]).toArray(),
    db.subtitleStyles.where('projectId').equals(projectId).first(),
    db.mosaicTracks.where('projectId').equals(projectId).toArray(),
    db.cutSuggestions.where('projectId').equals(projectId).sortBy('startMs'),
    db.waveforms.where('assetId').equals(asset.id).first(),
    db.transcripts.where('projectId').equals(projectId).first(),
    db.history.where('[projectId+seq]').between([projectId, -Infinity], [projectId, Infinity]).toArray(),
  ]);
  const trackDocs: MosaicTrackDoc[] = await Promise.all(tracks.map(async (t) => ({
    ...t,
    keyframes: await db.mosaicKeyframes.where('[trackId+timeMs]').between([t.id, -Infinity], [t.id, Infinity]).toArray(),
  })));
  const words = transcript
    ? await db.transcriptWords.where('[transcriptId+idx]').between([transcript.id, -Infinity], [transcript.id, Infinity]).toArray()
    : [];

  return {
    project,
    asset,
    doc: { edl, clips, words, style: styleRow ?? defaultStyle(projectId), tracks: trackDocs, view: projectView(project) },
    suggestions,
    peaks: waveform ? new Int8Array(waveform.peaks) : null,
    transcript: transcript ?? null,
    history: history.map((h) => {
      const parsed = JSON.parse(h.inversePatch) as Pick<UndoEntry, 'patches' | 'inverse'>;
      return { label: h.commandType, patches: parsed.patches, inverse: parsed.inverse };
    }),
  };
}

/** 편집 문서 전체를 덮어쓴다. 테이블 단위로 "지우고 다시 쓰기" — 항목 수가 수백 개 수준이라 diff보다 단순하고 안전하다 */
export async function saveProjectDoc(project: Project, doc: EditorDoc, suggestions: CutSuggestion[], history: UndoHistory): Promise<Project> {
  const db = getDb();
  const now = Date.now();
  const speeds = clipSpeedRanges(doc.clips);
  const next: Project = {
    ...project,
    durationMs: outputDurationMs(doc.edl, speeds, doc.view.globalSpeed),
    updatedAt: now,
    status: project.status === 'draft' ? 'editing' : project.status,
    aspectMode: doc.view.aspectMode,
    reframe: doc.view.reframe,
    fillMode: doc.view.fillMode,
    globalSpeed: doc.view.globalSpeed,
    pitchPreserve: doc.view.pitchPreserve,
  };
  const oldTrackIds = await db.mosaicTracks.where('projectId').equals(project.id).primaryKeys();
  await db.transaction('rw', [db.projects, db.edlSegments, db.editClips, db.transcriptWords, db.subtitleStyles, db.mosaicTracks, db.mosaicKeyframes, db.cutSuggestions, db.history], async () => {
    await db.projects.put(next);
    await db.edlSegments.where('projectId').equals(project.id).delete();
    await db.edlSegments.bulkPut(doc.edl);
    await db.editClips.where('projectId').equals(project.id).delete();
    await db.editClips.bulkPut(doc.clips);
    if (doc.words.length) await db.transcriptWords.bulkPut(doc.words);
    await db.subtitleStyles.put(doc.style);
    await db.mosaicTracks.where('projectId').equals(project.id).delete();
    if (oldTrackIds.length) await db.mosaicKeyframes.where('trackId').anyOf(oldTrackIds).delete();
    await db.mosaicTracks.bulkPut(doc.tracks.map(({ keyframes: _k, ...t }) => t));
    await db.mosaicKeyframes.bulkPut(doc.tracks.flatMap((t) => t.keyframes));
    await db.cutSuggestions.where('projectId').equals(project.id).delete();
    await db.cutSuggestions.bulkPut(suggestions);
    await db.history.where('projectId').equals(project.id).delete();
    await db.history.bulkPut(history.past.map((e, seq) => ({
      id: `${project.id}-h${seq}`, projectId: project.id, seq, commandType: e.label,
      inversePatch: JSON.stringify({ patches: e.patches, inverse: e.inverse }), createdAt: now,
    })));
  });
  return next;
}

export async function saveWaveform(assetId: string, peaks: Int8Array, pointsPerSecond: number): Promise<void> {
  const buffer = peaks.buffer.slice(peaks.byteOffset, peaks.byteOffset + peaks.byteLength) as ArrayBuffer;
  await getDb().waveforms.put({ id: `wf-${assetId}`, assetId, pointsPerSecond, peaks: buffer });
}

/** STT 결과 저장. 단어는 편집 문서(doc.words)로도 올라가고, 여기서는 원본 보관용으로 남는다 */
export async function saveTranscript(
  projectId: string, engine: Transcript['engine'], language: string, sttWords: SttWord[], fillers: FillerEntry[],
): Promise<{ transcript: Transcript; words: TranscriptWord[] }> {
  const db = getDb();
  const transcript: Transcript = { id: `tr-${nanoid(8)}`, projectId, engine, language, createdAt: Date.now() };
  const fillerRanges = matchFillers(sttWords.map((w) => ({ startMs: w.start, endMs: w.end, text: w.text })), fillers);
  const words: TranscriptWord[] = sttWords.map((w, idx) => ({
    id: `${transcript.id}-${idx}`, transcriptId: transcript.id, idx, startMs: w.start, endMs: w.end, text: w.text,
    confidence: w.confidence, isFiller: fillerRanges.some((f) => w.start >= f.startMs && w.end <= f.endMs),
    clipId: '', deleted: false,
  }));
  const old = await db.transcripts.where('projectId').equals(projectId).primaryKeys();
  await db.transaction('rw', [db.transcripts, db.transcriptWords], async () => {
    if (old.length) {
      await db.transcriptWords.where('transcriptId').anyOf(old).delete();
      await db.transcripts.bulkDelete(old);
    }
    await db.transcripts.add(transcript);
    await db.transcriptWords.bulkAdd(words);
  });
  return { transcript, words };
}

/** 외부 SRT로 시작할 때처럼 STT 없이 단어를 만들어야 하는 경우 */
export async function saveImportedWords(projectId: string, words: TranscriptWord[], language = 'ko'): Promise<Transcript> {
  const db = getDb();
  const transcript: Transcript = { id: words[0]?.transcriptId ?? `tr-${nanoid(8)}`, projectId, engine: 'manual', language, createdAt: Date.now() };
  const old = await db.transcripts.where('projectId').equals(projectId).primaryKeys();
  await db.transaction('rw', [db.transcripts, db.transcriptWords], async () => {
    if (old.length) {
      await db.transcriptWords.where('transcriptId').anyOf(old).delete();
      await db.transcripts.bulkDelete(old);
    }
    await db.transcripts.put(transcript);
    if (words.length) await db.transcriptWords.bulkPut(words.map((w) => ({ ...w, transcriptId: transcript.id })));
  });
  return transcript;
}

export async function getSourceFile(asset: MediaAsset): Promise<File> {
  return readFile(asset.opfsPath);
}

/** IndexedDB와 OPFS를 함께 지운다. OPFS 삭제가 실패해도 나중에 orphan 스캔으로 정리된다 */
export async function deleteProject(projectId: string): Promise<void> {
  await deleteProjectRecords(getDb(), projectId);
  await deleteDir(paths.projectDir(projectId)).catch(() => undefined);
}

export interface StorageRow {
  project: Project;
  bytes: number;
  stale: boolean;
}

const STALE_MS = 30 * 24 * 3600 * 1000;

export async function storageReport(): Promise<StorageRow[]> {
  const projects = await listProjects();
  return Promise.all(projects.map(async (project) => ({
    project,
    bytes: await dirSize(paths.projectDir(project.id)).catch(() => 0),
    stale: Date.now() - project.updatedAt > STALE_MS,
  })));
}

export async function cleanupOrphans(): Promise<number> {
  const orphans = await listOrphans();
  for (const id of orphans) await deleteDir(paths.projectDir(id));
  return orphans.length;
}

// ── .editon.json (ERD 6.5 + v2) ────────────────────────────────────────

export interface EditonProjectFile {
  format: 'editon-project';
  version: 2;
  project: Project;
  assets: Omit<MediaAsset, 'opfsPath'>[];
  edlSegments: EditorDoc['edl'];
  clips: EditClip[];
  words: TranscriptWord[];
  subtitleStyle: SubtitleStyle;
  view: ProjectView;
  mosaicTracks: { track: Omit<MosaicTrackDoc, 'keyframes'>; keyframes: MosaicTrackDoc['keyframes'] }[];
}

export async function buildProjectFile(projectId: string): Promise<EditonProjectFile> {
  const b = await loadProjectBundle(projectId);
  const { opfsPath: _p, ...asset } = b.asset;
  return {
    format: 'editon-project',
    version: 2,
    project: b.project,
    assets: [asset],
    edlSegments: b.doc.edl,
    clips: b.doc.clips,
    words: b.doc.words,
    subtitleStyle: b.doc.style,
    view: b.doc.view,
    mosaicTracks: b.doc.tracks.map(({ keyframes, ...track }) => ({ track, keyframes })),
  };
}

export function parseProjectFile(json: unknown): EditonProjectFile {
  const f = json as Partial<EditonProjectFile> & { subtitleCues?: unknown[] } | null;
  if (!f || f.format !== 'editon-project' || !f.project || !Array.isArray(f.assets) || !f.assets[0]
    || !Array.isArray(f.edlSegments) || !f.subtitleStyle) {
    throw new AppError('UNSUPPORTED_FORMAT', '편집ON 프로젝트 파일이 아니거나 손상되었습니다.', '.editon.json 파일을 다시 선택해 주세요.');
  }
  return {
    ...f,
    version: 2,
    clips: Array.isArray(f.clips) ? f.clips : [],
    words: Array.isArray(f.words) ? f.words : [],
    view: f.view ?? DEFAULT_PROJECT_VIEW,
    mosaicTracks: Array.isArray(f.mosaicTracks) ? f.mosaicTracks : [],
  } as EditonProjectFile;
}

/** 원본 재연결 검증: 파일 크기가 같거나, 길이가 0.5초 이내로 같으면 같은 파일로 본다 */
export function isSameSource(asset: Pick<MediaAsset, 'fileSize' | 'durationMs'>, file: { size: number }, durationMs?: number): boolean {
  if (asset.fileSize === file.size) return true;
  return durationMs !== undefined && Math.abs(asset.durationMs - durationMs) <= 500;
}

export { SCHEMA_VERSION };
