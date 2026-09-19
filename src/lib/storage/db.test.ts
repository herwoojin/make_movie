import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import type { EditClip, Project } from '@/types/models';
import { DEFAULT_PROJECT_VIEW } from '@/types/editor';
import { deleteProjectRecords, EditOnDB } from './db';
import { projectView } from './projectRepo';

const project = (id: string, updatedAt: number): Project => ({
  id, name: id, durationMs: 1000, sourceDurationMs: 1000, width: 640, height: 360, fps: 30,
  status: 'editing', createdAt: 0, updatedAt, schemaVersion: 2,
  ...DEFAULT_PROJECT_VIEW, pipelineStage: 1, sourceTool: 'import',
});

let db: EditOnDB;
afterEach(async () => {
  await db?.delete();
});

describe('EditOnDB', () => {
  it('스키마 생성 + 테이블 20개', async () => {
    db = new EditOnDB(`t-${Math.random()}`);
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toEqual(expect.arrayContaining(['editClips', 'savedResults', 'fsHandles']));
    expect(db.tables).toHaveLength(20);
  });

  it('생성/조회(인덱스)/삭제', async () => {
    db = new EditOnDB(`t-${Math.random()}`);
    await db.projects.bulkAdd([project('a', 1), project('b', 3), project('c', 2)]);
    const recent = await db.projects.orderBy('updatedAt').reverse().toArray();
    expect(recent.map((p) => p.id)).toEqual(['b', 'c', 'a']);
    await db.projects.delete('b');
    expect(await db.projects.count()).toBe(2);
  });

  it('복합 인덱스 [projectId+order]로 EDL 순서 조회', async () => {
    db = new EditOnDB(`t-${Math.random()}`);
    const base = { projectId: 'p', assetId: 'a', enabled: true, origin: 'initial' as const, updatedAt: 0 };
    await db.edlSegments.bulkAdd([
      { ...base, id: 's2', order: 1, sourceStartMs: 100, sourceEndMs: 200 },
      { ...base, id: 's1', order: 0, sourceStartMs: 0, sourceEndMs: 100 },
      { ...base, id: 'x', projectId: 'other', order: 0, sourceStartMs: 0, sourceEndMs: 5 },
    ]);
    const segs = await db.edlSegments.where('[projectId+order]').between(['p', -Infinity], ['p', Infinity]).toArray();
    expect(segs.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('deleteProjectRecords는 딸린 레코드를 모두 지우고 다른 프로젝트는 남긴다', async () => {
    db = new EditOnDB(`t-${Math.random()}`);
    await db.projects.bulkAdd([project('p', 1), project('q', 1)]);
    await db.mediaAssets.add({ id: 'a1', projectId: 'p', kind: 'video', fileName: 'x.mp4', fileSize: 1, mimeType: 'video/mp4', opfsPath: 'projects/p/source/a1.mp4', durationMs: 1, createdAt: 0 });
    await db.waveforms.add({ id: 'w1', assetId: 'a1', pointsPerSecond: 100, peaks: new ArrayBuffer(4) });
    await db.transcripts.add({ id: 't1', projectId: 'p', engine: 'manual', language: 'ko', createdAt: 0 });
    await db.transcriptWords.add({ id: 'tw1', transcriptId: 't1', idx: 0, startMs: 0, endMs: 1, text: '음', isFiller: true, clipId: 'c1', deleted: false });
    await db.editClips.add({
      id: 'c1', projectId: 'p', idx: 0, sourceKind: 'video-edit', sourceStartMs: 0, sourceEndMs: 1,
      captionText: '음', captionTextOriginal: '음', captionEdited: false, enabled: true, speed: 1,
    });
    await db.mosaicTracks.add({ id: 'm1', projectId: 'p', personLabel: '인물 1', enabled: true, mode: 'pixelate', intensity: 16, scale: 1.2, shape: 'rect', createdBy: 'auto', startMs: 0, endMs: 1 });
    await db.mosaicKeyframes.add({ id: 'k1', trackId: 'm1', timeMs: 0, x: 0, y: 0, w: 0.1, h: 0.1, score: 1, interpolated: false });
    await db.mediaAssets.add({ id: 'a2', projectId: 'q', kind: 'video', fileName: 'y.mp4', fileSize: 1, mimeType: 'video/mp4', opfsPath: 'projects/q/source/a2.mp4', durationMs: 1, createdAt: 0 });

    await deleteProjectRecords(db, 'p');
    expect(await db.projects.toCollection().primaryKeys()).toEqual(['q']);
    expect(await db.waveforms.count()).toBe(0);
    expect(await db.transcriptWords.count()).toBe(0);
    expect(await db.mosaicKeyframes.count()).toBe(0);
    expect(await db.editClips.count()).toBe(0);
    expect(await db.mediaAssets.count()).toBe(1);
  });

  it('v1 데이터를 열면 자막 큐가 편집 클립으로 옮겨진다', async () => {
    const name = `t-${Math.random()}`;
    // v1 스키마로 먼저 만들고 v1 형태의 데이터를 넣는다
    const old = new Dexie(name);
    old.version(1).stores({
      projects: 'id, updatedAt, status',
      subtitleCues: 'id, projectId, [projectId+idx], startMs',
      subtitleStyles: 'id, projectId',
      transcriptWords: 'id, transcriptId, [transcriptId+idx], startMs, isFiller',
    });
    await old.open();
    await old.table('projects').add({ id: 'p', name: 'p', durationMs: 1000, sourceDurationMs: 1000, width: 640, height: 360, fps: 30, status: 'editing', createdAt: 0, updatedAt: 0, schemaVersion: 1 });
    await old.table('subtitleCues').bulkAdd([
      { id: 'q2', projectId: 'p', idx: 1, startMs: 2000, endMs: 3000, sourceStartMs: 2000, sourceEndMs: 3000, text: '뒤', orphan: false, locked: false },
      { id: 'q1', projectId: 'p', idx: 0, startMs: 0, endMs: 1000, sourceStartMs: 0, sourceEndMs: 1000, text: '앞', orphan: false, locked: false },
    ]);
    await old.table('subtitleStyles').add({ id: 'style-p', projectId: 'p', fontFamily: 'Pretendard', fontSize: 64, color: '#fff', outlineColor: '#000', outlineWidth: 4, bgOpacity: 0, bgPaddingX: 16, bgPaddingY: 8, marginBottom: 80, maxCharsPerLine: 20, maxLines: 2, alignment: 'center', verticalPosition: 'bottom', bold: true, shadowBlur: 0 });
    await old.table('transcriptWords').add({ id: 'w1', transcriptId: 't1', idx: 0, startMs: 0, endMs: 500, text: '앞', isFiller: false });
    old.close();

    db = new EditOnDB(name);
    await db.open();
    const clips = await db.editClips.where('[projectId+idx]').between(['p', -Infinity], ['p', Infinity]).toArray();
    expect(clips.map((c: EditClip) => [c.idx, c.captionText])).toEqual([[0, '앞'], [1, '뒤']]);
    expect(clips.every((c: EditClip) => c.enabled && c.speed === 1 && !c.captionEdited)).toBe(true);
    expect((await db.projects.get('p'))?.aspectMode).toBe('original');
    expect((await db.subtitleStyles.get('style-p'))?.outlineEnabled).toBe(true);
    expect((await db.transcriptWords.get('w1'))?.deleted).toBe(false);
  });
});

describe('projectView 자막 언어', () => {
  it('해외 영상 한국어 자막으로 만든 프로젝트는 처음부터 한국어로 보여 준다', () => {
    const { captionLang: _omit, ...base } = project('t', 0);
    expect(projectView({ ...base, sourceTool: 'translate' }).captionLang).toBe('translated');
    expect(projectView(base).captionLang).toBe('original');
    expect(projectView({ ...base, sourceTool: 'translate', captionLang: 'original' }).captionLang).toBe('original');
  });
});
