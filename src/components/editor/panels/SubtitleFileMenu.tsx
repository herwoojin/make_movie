'use client';

import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { clipSpeedRanges } from '@/lib/core/clips';
import { clipsToCues, cuesToClips } from '@/lib/subtitle/clipCues';
import { parseSubtitles, toSrt, toVtt } from '@/lib/subtitle/srt';
import { saveImportedWords } from '@/lib/storage/projectRepo';
import { downloadBlob } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';

export function SubtitleFileMenu() {
  const hasClips = useProjectStore((s) => s.doc.clips.some((c) => c.enabled && c.captionText.trim()));

  const download = (kind: 'srt' | 'vtt') => {
    const { doc, project } = useProjectStore.getState();
    const cues = clipsToCues(doc.clips, doc.edl, clipSpeedRanges(doc.clips), doc.view.globalSpeed);
    const text = kind === 'srt' ? toSrt(cues) : toVtt(cues);
    downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), `${project?.name ?? '자막'}.${kind}`);
  };

  const importFile = async (file: File) => {
    const parsed = parseSubtitles(await file.text());
    if (parsed.length === 0) {
      useUiStore.getState().toast({ kind: 'error', title: '자막을 읽지 못했습니다.', hint: 'SRT 또는 VTT 형식의 파일인지 확인해 주세요.' });
      return;
    }
    const { project } = useProjectStore.getState();
    if (!project) return;
    const { clips, words } = cuesToClips(parsed, project.id);
    // 단어 시간이 글자 수로 추정된 값이라 칩 삭제가 정확하지 않을 수 있다 — 아래에서 알린다
    const transcript = await saveImportedWords(project.id, words);
    useProjectStore.getState().replaceTranscript(transcript, words.map((w) => ({ ...w, transcriptId: transcript.id })), {
      clips, label: '자막 파일 불러오기',
    });
    useUiStore.getState().toast({
      kind: 'success',
      title: `자막 ${parsed.length}개를 불러왔습니다.`,
      hint: '이 자막에는 단어별 시간이 없어 칩 하나하나의 시간은 글자 수로 어림잡았습니다.',
    });
  };

  return (
    <Section title="자막 파일" description="유튜브에 따로 올릴 자막 파일(SRT·VTT)을 받거나, 가진 자막 파일을 불러옵니다.">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" disabled={!hasClips} onClick={() => download('srt')}><Download /> SRT 받기</Button>
        <Button size="sm" variant="secondary" disabled={!hasClips} onClick={() => download('vtt')}><Download /> VTT 받기</Button>
        <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs font-medium hover:bg-accent">
          <Upload className="h-4 w-4" /> 자막 파일 불러오기
          <input type="file" accept=".srt,.vtt,text/vtt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        </label>
      </div>
    </Section>
  );
}
