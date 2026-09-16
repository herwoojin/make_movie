'use client';

import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { Input } from '@/components/ui/misc';
import { settings } from '@/lib/settings';
import { DEFAULT_FILLERS, matchFillers, type FillerEntry } from '@/lib/stt/fillers';
import { cn } from '@/lib/utils';
import { useProjectStore } from '@/store/projectStore';
import { useUiStore } from '@/store/uiStore';

export function FillerSection() {
  const words = useProjectStore((s) => s.words);
  const [fillers, setFillers] = useState<FillerEntry[]>(DEFAULT_FILLERS);
  const [newWord, setNewWord] = useState('');
  useEffect(() => setFillers(settings.getFillers()), []);

  const save = (next: FillerEntry[]) => { setFillers(next); settings.setFillers(next); };

  const find = () => {
    const { project, suggestions, setSuggestions } = useProjectStore.getState();
    const found = matchFillers(words.map((w) => ({ startMs: w.startMs, endMs: w.endMs, text: w.text, confidence: w.confidence })), fillers, project?.id ?? '');
    const prev = new Map(suggestions.map((s) => [s.id, s.decision]));
    const next = [...suggestions.filter((s) => s.source !== 'filler'), ...found.map((f) => ({ ...f, decision: prev.get(f.id) ?? f.decision }))]
      .sort((a, b) => a.startMs - b.startMs);
    setSuggestions(next);
    useUiStore.getState().toast({ kind: found.length ? 'success' : 'info', title: found.length ? `추임새 ${found.length}곳을 찾았습니다.` : '추임새를 찾지 못했습니다.' });
  };

  return (
    <Section title="추임새 제거" description="“어… 음…” 같은 말버릇을 찾아 자릅니다. 음성 인식(자막 만들기)이 먼저 필요합니다.">
      {words.length === 0 ? (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">아직 음성 인식 결과가 없습니다.</p>
          <Button size="sm" variant="secondary" onClick={() => useUiStore.getState().setPanel('subtitle')}>자막 만들러 가기</Button>
        </div>
      ) : (
        <Button size="sm" onClick={find}>추임새 찾기 ({words.length}개 단어에서)</Button>
      )}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">추임새 사전 — 눌러서 켜고 끕니다. “그·저·뭐”는 뜻 있는 말로도 쓰여 기본으로 꺼져 있습니다.</p>
        <ul className="flex flex-wrap gap-1.5">
          {fillers.map((f, i) => (
            <li key={f.word} className={cn('flex items-center rounded-full border text-xs', f.enabled ? 'border-orange-400/60 bg-orange-500/15' : 'opacity-60')}>
              <button type="button" aria-pressed={f.enabled} className="px-2 py-1" onClick={() => save(fillers.map((x, j) => (j === i ? { ...x, enabled: !x.enabled } : x)))}>
                {f.word}
              </button>
              <button type="button" aria-label={`${f.word} 사전에서 빼기`} className="pr-1.5 text-muted-foreground hover:text-foreground" onClick={() => save(fillers.filter((_, j) => j !== i))}>
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
        <form className="flex gap-2" onSubmit={(e) => {
          e.preventDefault();
          const w = newWord.trim();
          if (w && !fillers.some((f) => f.word === w)) save([...fillers, { word: w, enabled: true }]);
          setNewWord('');
        }}>
          <Input value={newWord} onChange={(e) => setNewWord(e.target.value)} placeholder="추가할 말버릇 (예: 약간)" className="h-8" aria-label="추임새 단어 추가" />
          <Button size="sm" type="submit" variant="secondary"><Plus /> 추가</Button>
        </form>
      </div>
    </Section>
  );
}
