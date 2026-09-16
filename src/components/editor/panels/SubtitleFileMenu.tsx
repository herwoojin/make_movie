'use client';

import { Download, Upload } from 'lucide-react';
import { nanoid } from 'nanoid';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { renumberCues, setCueTiming } from '@/lib/subtitle/model';
import { parseSubtitles, toSrt, toVtt } from '@/lib/subtitle/srt';
import { downloadBlob } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';

export function SubtitleFileMenu() {
  const hasCues = useProjectStore((s) => s.doc.cues.some((c) => !c.orphan));

  const download = (kind: 'srt' | 'vtt') => {
    const { doc, project } = useProjectStore.getState();
    const text = kind === 'srt' ? toSrt(doc.cues) : toVtt(doc.cues);
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${project?.name ?? '자막'}.${kind}`);
  };

  const importFile = async (file: File) => {
    const parsed = parseSubtitles(await file.text());
    if (parsed.length === 0) {
      useUiStore.getState().toast({ kind: 'error', title: '자막을 읽지 못했습니다.', hint: 'SRT 또는 VTT 형식의 파일인지 확인해 주세요.' });
      return;
    }
    const projectId = useProjectStore.getState().project?.id ?? '';
    // 자막 파일의 시간은 결과물(편집 후) 기준으로 보고 원본 앵커를 역산한다
    useProjectStore.getState().edit('자막 파일 불러오기', (d) => {
      d.cues = renumberCues(parsed.map((p) => setCueTiming({
        id: `cue-${nanoid(8)}`, projectId, idx: 0, startMs: p.startMs, endMs: p.endMs,
        sourceStartMs: p.startMs, sourceEndMs: p.endMs, orphan: false, text: p.text, locked: false,
      }, p.startMs, p.endMs, d.edl)));
    });
    useUiStore.getState().toast({ kind: 'success', title: `자막 ${parsed.length}개를 불러왔습니다.` });
  };

  return (
    <Section title="자막 파일" description="유튜브에 따로 올릴 자막 파일(SRT·VTT)을 받거나, 가진 자막 파일을 불러옵니다.">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={!hasCues} onClick={() => download('srt')}><Download /> SRT 받기</Button>
        <Button size="sm" variant="secondary" disabled={!hasCues} onClick={() => download('vtt')}><Download /> VTT 받기</Button>
        <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs font-medium hover:bg-accent">
          <Upload className="h-4 w-4" /> 자막 파일 불러오기
          <input type="file" accept=".srt,.vtt,text/vtt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        </label>
      </div>
    </Section>
  );
}
