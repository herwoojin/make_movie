'use client';

// 단어 칩. ⊗를 누르면 200ms 페이드아웃 뒤에 실제로 지운다 — 눈으로 "사라지는 것"을 보고 나서 결과가 바뀌게.
import { RotateCcw, X } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import type { TranscriptWord } from '@/types/models';
import { cn } from '@/lib/utils';

const FADE_MS = 200;

interface Props {
  word: TranscriptWord;
  onDelete: (wordId: string) => void;
  onRestore: (wordId: string) => void;
  onSeek: (ms: number) => void;
}

export const WordChip = memo(function WordChip({ word, onDelete, onRestore, onSeek }: Props) {
  const [fading, setFading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const remove = () => {
    if (fading) return;
    setFading(true);
    timer.current = setTimeout(() => onDelete(word.id), FADE_MS);
  };

  if (word.deleted) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-muted-foreground/40 px-1.5 py-0.5 text-xs text-muted-foreground line-through">
        {word.text}
        <button type="button" aria-label={`"${word.text}" 되살리기`} title="되살리기" className="text-muted-foreground hover:text-foreground"
          onClick={() => onRestore(word.id)}>
          <RotateCcw className="h-3 w-3" aria-hidden />
        </button>
      </span>
    );
  }

  return (
    <span
      className={cn(
        'group inline-flex items-center rounded-md border bg-muted/40 text-xs transition-opacity duration-200',
        word.isFiller && 'border-orange-400/60 bg-orange-500/10',
        fading && 'opacity-0',
      )}
    >
      <button
        type="button"
        className="rounded-l-md px-1.5 py-0.5 hover:bg-accent"
        title={`${(word.startMs / 1000).toFixed(1)}초로 이동`}
        onClick={() => onSeek(word.startMs)}
        onKeyDown={(e) => {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            e.stopPropagation(); // 전역 단축키(구간 삭제)까지 함께 발동하지 않게
            remove();
          }
        }}
      >
        {word.text}
      </button>
      <button
        type="button"
        aria-label={`"${word.text}" 지우기`}
        title="이 단어를 영상에서 지우기"
        className="rounded-r-md px-1 py-0.5 text-muted-foreground opacity-60 hover:bg-destructive/20 hover:text-destructive group-hover:opacity-100"
        onClick={remove}
      >
        <X className="h-3 w-3" aria-hidden />
      </button>
    </span>
  );
});
