'use client';

import { Loader2, RotateCcw, ScanSearch, Scissors } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section, SliderField } from '@/components/ui/field';
import { DEFAULT_SILENCE_PARAMS, type SilenceParams } from '@/lib/audio/silence';
import { applySuggestions, removedRanges, revertAuto } from '@/lib/core/edl';
import { formatDuration } from '@/lib/core/timecode';
import { toAppError } from '@/lib/errors';
import { settings } from '@/lib/settings';
import { paths } from '@/lib/storage/opfs';
import { debounce } from '@/lib/utils';
import { audioWorker } from '@/lib/worker/instances';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';
import { FillerSection } from './FillerSection';
import { isApplied, SuggestionList } from './SuggestionList';

export function AutoCutPanel() {
  const peaks = useProjectStore((s) => s.peaks);
  const analysis = useProjectStore((s) => s.analysis);
  const suggestions = useProjectStore((s) => s.suggestions);
  const edl = useProjectStore((s) => s.doc.edl);
  const [params, setParams] = useState<SilenceParams>(DEFAULT_SILENCE_PARAMS);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const hasSilence = suggestions.some((s) => s.source === 'silence');

  useEffect(() => setParams(settings.getSilenceParams()), []);

  const detect = useCallback(async (p: SilenceParams) => {
    const { project, asset } = useProjectStore.getState();
    if (!project || !asset) return;
    setBusy(true);
    try {
      const call = () => audioWorker().call('silence', { key: asset.id, pcmPath: paths.pcm(project.id, asset.id), sampleRate: 16_000, params: p, projectId: project.id });
      let res;
      try {
        res = await call();
      } catch (e) {
        if (toAppError(e).code !== 'NOT_FOUND') throw e;
        await useProjectStore.getState().runAnalysis();
        res = await call();
      }
      const prev = new Map(useProjectStore.getState().suggestions.map((s) => [s.id, s.decision]));
      const fillers = useProjectStore.getState().suggestions.filter((s) => s.source === 'filler');
      const next = [...res.suggestions.map((s) => ({ ...s, decision: prev.get(s.id) ?? s.decision })), ...fillers].sort((a, b) => a.startMs - b.startMs);
      useProjectStore.getState().setSuggestions(next);
      setElapsed(res.elapsedMs);
    } catch (e) {
      useUiStore.getState().showError(e);
    } finally {
      setBusy(false);
    }
  }, []);

  // 슬라이더를 움직이면 300ms 뒤 워커에서 다시 계산 — 파형 위 빨간 영역이 바로 따라온다
  const debounced = useMemo(() => debounce((p: SilenceParams) => void detect(p), 300), [detect]);
  useEffect(() => () => debounced.cancel(), [debounced]);

  const update = (patch: Partial<SilenceParams>) => {
    const next = { ...params, ...patch };
    setParams(next);
    settings.setSilenceParams(next);
    if (hasSilence) debounced(next);
  };

  const removed = removedRanges(edl);
  const toApply = suggestions.filter((s) => s.decision !== 'rejected' && !isApplied(s, removed));
  const savedMs = toApply.reduce((a, s) => a + s.endMs - s.startMs, 0);

  const apply = () => {
    useProjectStore.getState().edit(`자동 컷 ${toApply.length}개 적용`, (d) => { d.edl = applySuggestions(d.edl, toApply, undefined, Date.now()); });
    useUiStore.getState().toast({ kind: 'success', title: `${toApply.length}개 구간을 잘랐습니다. (${formatDuration(savedMs)} 줄어듦)`, hint: '마음에 안 들면 Ctrl+Z로 되돌릴 수 있습니다. 파일은 내보낼 때 한 번만 만들어집니다.' });
  };

  if (!peaks) {
    return (
      <Section title="무음 자동 컷" description="말 없는 구간을 소리 크기로 찾아냅니다.">
        {analysis ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {analysis.label} ({Math.round(analysis.ratio * 100)}%)</p>
        ) : (
          <p className="text-sm text-muted-foreground">이 영상에서는 소리를 찾지 못했습니다. 컷 편집은 타임라인에서 직접 할 수 있습니다.</p>
        )}
      </Section>
    );
  }

  return (
    <>
      <Section title="무음 자동 컷" description="말이 없는 구간을 찾아 목록으로 보여줍니다. 적용하기 전에는 아무것도 잘리지 않습니다.">
        <SliderField label="무음 임계값 (조용하다고 판단할 소리 크기)" value={params.thresholdDb} min={-60} max={-15} format={(v) => `${v}dB`}
          hint="숫자를 낮추면(-50) 아주 조용한 곳만 잡고, 높이면(-25) 작은 말소리도 무음으로 봅니다. 너무 많이 잡히면 낮추세요." onChange={(v) => update({ thresholdDb: v })} />
        <SliderField label="최소 무음 길이" value={params.minSilenceMs} min={100} max={3000} step={50} format={(v) => formatDuration(v)}
          hint="이보다 짧게 쉬는 곳은 자르지 않습니다. 말하다 숨 쉬는 틈까지 잘리면 늘리세요." onChange={(v) => update({ minSilenceMs: v })} />
        <SliderField label="앞뒤 여백" value={params.paddingMs} min={0} max={1000} step={10} format={(v) => formatDuration(v)}
          hint="잘린 곳 앞뒤로 남겨 둘 여유입니다. 너무 작으면 말이 뚝 끊겨 들립니다." onChange={(v) => update({ paddingMs: v })} />
        <SliderField label="최소 유지 길이" value={params.minKeepMs} min={0} max={2000} step={50} format={(v) => formatDuration(v)}
          hint="이보다 짧게 남는 소리 조각(기침·잡음)은 앞뒤 컷과 합쳐 함께 잘라냅니다." onChange={(v) => update({ minKeepMs: v })} />
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void detect(params)} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <ScanSearch />} {hasSilence ? '다시 찾기' : '무음 찾기'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setParams(DEFAULT_SILENCE_PARAMS); settings.setSilenceParams(DEFAULT_SILENCE_PARAMS); if (hasSilence) debounced(DEFAULT_SILENCE_PARAMS); }}>기본값</Button>
          {elapsed !== null && <span className="self-center text-xs text-muted-foreground">분석 {elapsed}ms</span>}
        </div>
      </Section>

      <FillerSection />

      {suggestions.length > 0 && (
        <Section title={`자를 제안 ${suggestions.length}개`} description="빨간 막대를 누르면 살리기로 바뀝니다. ▶로 앞뒤를 들어 보세요.">
          <SuggestionList suggestions={suggestions} removed={removed} />
          <div className="flex flex-wrap gap-2">
            <Button onClick={apply} disabled={toApply.length === 0}><Scissors /> 선택한 {toApply.length}개 적용 ({formatDuration(savedMs)})</Button>
            <Button variant="outline" onClick={() => useProjectStore.getState().edit('자동 컷 전체 되돌리기', (d) => { d.edl = revertAuto(d.edl, Date.now()); })}>
              <RotateCcw /> 전체 되돌리기
            </Button>
          </div>
        </Section>
      )}
    </>
  );
}
