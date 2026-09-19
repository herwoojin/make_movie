'use client';

// 클립 한 줄. 목록이 3,000줄이어도 끊기지 않도록 memo로 감싸고, 바뀐 클립만 다시 그린다.
import { Film, Mic, Play, X } from 'lucide-react';
import { memo } from 'react';
import type { EditClip, TranscriptWord } from '@/types/models';
import { recalcClipDuration } from '@/lib/core/clips';
import { formatDuration, formatShort } from '@/lib/core/timecode';
import { cn } from '@/lib/utils';
import { CaptionInput } from './CaptionInput';
import { WordChip } from './WordChip';

export interface ClipRowHandlers {
  onToggleSelect: (clipId: string) => void;
  onPlay: (clip: EditClip) => void;
  onRemove: (clipId: string) => void;
  onRestoreClip: (clipId: string) => void;
  onDeleteWord: (wordId: string) => void;
  onRestoreWord: (wordId: string) => void;
  onSeek: (ms: number) => void;
  onCaption: (clipId: string, text: string) => void;
  onResetCaption: (clipId: string) => void;
  onTranslation: (clipId: string, text: string) => void;
}

interface Props extends ClipRowHandlers {
  clip: EditClip;
  words: TranscriptWord[];
  selected: boolean;
  active: boolean;
  showDeleted: boolean;
  /** 번역 프로젝트면 원어 줄 아래에 한국어 줄을 보여 준다. 'translated'면 한국어가 화면에 나가는 자막 */
  captionLang: 'original' | 'translated' | null;
}

const SOURCE_BADGE = {
  'video-edit': { label: '영상편집', Icon: Film },
  'source-audio': { label: '원어 음성', Icon: Mic },
} as const;

export const ClipRow = memo(function ClipRow({
  clip, words, selected, active, showDeleted, captionLang,
  onToggleSelect, onPlay, onRemove, onRestoreClip, onDeleteWord, onRestoreWord, onSeek, onCaption, onResetCaption, onTranslation,
}: Props) {
  const { label, Icon } = SOURCE_BADGE[clip.sourceKind];
  const durationMs = recalcClipDuration(clip, words);
  const visible = showDeleted ? words : words.filter((w) => !w.deleted);
  const deletedCount = words.length - words.filter((w) => !w.deleted).length;

  return (
    <div
      className={cn(
        'rounded-lg border p-2 transition-colors',
        active ? 'border-primary bg-primary/5' : selected ? 'border-sky-400' : 'border-border',
        !clip.enabled && 'opacity-50',
      )}
    >
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(clip.id)}
          aria-label={`${clip.idx + 1}번 클립 선택`}
          className="h-4 w-4 accent-sky-500"
        />
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{clip.idx + 1}</span>
        <span className="inline-flex items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 text-[11px] text-muted-foreground">
          <Icon className="h-3 w-3" aria-hidden /> {label}
        </span>
        <span className={cn('text-xs tabular-nums text-muted-foreground', !clip.enabled && 'line-through')}>
          {formatShort(clip.sourceStartMs)} + {formatDuration(durationMs)}
        </span>
        {clip.speed !== 1 && <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[11px] text-amber-300">{clip.speed}×</span>}
        {deletedCount > 0 && <span className="text-[11px] text-muted-foreground">지운 단어 {deletedCount}개</span>}
        <span className="flex-1" />
        <button type="button" aria-label={`${clip.idx + 1}번 클립 미리듣기`} title="이 클립만 반복 재생" className="rounded p-1 hover:bg-accent"
          onClick={() => onPlay(clip)}>
          <Play className="h-4 w-4" aria-hidden />
        </button>
        {clip.enabled ? (
          <button type="button" aria-label={`${clip.idx + 1}번 클립 삭제`} title="이 클립을 통째로 빼기" className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            onClick={() => onRemove(clip.id)}>
            <X className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <button type="button" className="rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            onClick={() => onRestoreClip(clip.id)}>되살리기</button>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1 pl-6">
        {visible.map((w) => (
          <WordChip key={w.id} word={w} onDelete={onDeleteWord} onRestore={onRestoreWord} onSeek={onSeek} />
        ))}
        {visible.length === 0 && <span className="text-xs text-muted-foreground">단어가 모두 지워졌습니다.</span>}
      </div>

      <div className="mt-1 pl-5">
        <CaptionInput clipId={clip.id} text={clip.captionText} edited={clip.captionEdited} onChange={onCaption} onReset={onResetCaption}
          onScreen={captionLang === 'original' || (captionLang === 'translated' && !clip.translatedText?.trim())} />
        {captionLang && (
          <CaptionInput clipId={clip.id} text={clip.translatedText ?? ''} edited={false} onChange={onTranslation}
            prefix="한국어" ariaLabel="한국어 자막" placeholder="아직 번역하지 않음 (원어로 나갑니다)"
            onScreen={captionLang === 'translated' && Boolean(clip.translatedText?.trim())} />
        )}
      </div>
    </div>
  );
});
