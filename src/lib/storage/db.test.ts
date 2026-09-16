import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { Project } from '@/types/models';
import { deleteProjectRecords, EditOnDB } from './db';

const project = (id: string, updatedAt: number): Project => ({
  id, name: id, durationMs: 1000, sourceDurationMs: 1000, width: 640, height: 360, fps: 30,
  status: 'editing', createdAt: 0, updatedAt, schemaVersion: 1,
});

let db: EditOnDB;
afterEach(async () => {
  await db?.delete();
});

describe('EditOnDB', () => {
  it('스키마 생성 + 테이블 15개', async () => {
    db = new EditOnDB(`t-${Math.random()}`);
    await db.open();
    expect(db.tables.map((t) => t.name).sort()).toContain('edlSegments');
    expect(db.tables).toHaveLength(15);
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
    await db.transcriptWords.add({ id: 'tw1', transcriptId: 't1', idx: 0, startMs: 0, endMs: 1, text: '음', isFiller: true });
    await db.mosaicTracks.add({ id: 'm1', projectId: 'p', personLabel: '인물 1', enabled: true, mode: 'pixelate', intensity: 16, scale: 1.2, shape: 'rect', createdBy: 'auto', startMs: 0, endMs: 1 });
    await db.mosaicKeyframes.add({ id: 'k1', trackId: 'm1', timeMs: 0, x: 0, y: 0, w: 0.1, h: 0.1, score: 1, interpolated: false });
    await db.mediaAssets.add({ id: 'a2', projectId: 'q', kind: 'video', fileName: 'y.mp4', fileSize: 1, mimeType: 'video/mp4', opfsPath: 'projects/q/source/a2.mp4', durationMs: 1, createdAt: 0 });

    await deleteProjectRecords(db, 'p');
    expect(await db.projects.toCollection().primaryKeys()).toEqual(['q']);
    expect(await db.waveforms.count()).toBe(0);
    expect(await db.transcriptWords.count()).toBe(0);
    expect(await db.mosaicKeyframes.count()).toBe(0);
    expect(await db.mediaAssets.count()).toBe(1);
  });
});
