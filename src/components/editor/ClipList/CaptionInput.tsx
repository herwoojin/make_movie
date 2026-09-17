'use client';

// 자막 입력줄. 여기서 글자를 고쳐도 영상은 잘리지 않는다 — 텍스트만 바뀐다.
import { RotateCcw } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  clipId: string;
  text: string;
  edited: boolean;
  onChange: (clipId: string, text: string) => void;
  onReset: (clipId: string) => void;
}

export const CaptionInput = memo(function CaptionInput({ clipId, text, edited, onChange, onReset }: Props) {
  const [value, setValue] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  const focused = useRef(false);

  // 밖에서 바뀐 값(단어 삭제·되돌리기)은 반영하되, 입력 중에는 덮어쓰지 않는다
  useEffect(() => {
    if (!focused.current) setValue(text);
  }, [text]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className="flex items-start gap-1">
      <span aria-hidden className="pt-1 text-xs text-muted-foreground">⌨</span>
      <textarea
        ref={ref}
        rows={1}
        value={value}
        aria-label="자막 글자"
        className={cn(
          'scrollbar-thin min-h-7 w-full resize-none rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm',
          'hover:border-border focus:border-primary focus:outline-none',
        )}
        onFocus={() => { focused.current = true; }}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          focused.current = false;
          if (value !== text) onChange(clipId, value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setValue(text);
            e.currentTarget.blur();
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
      />
      {edited && (
        <button type="button" title="자동 생성된 자막으로 되돌리기" aria-label="자동 생성된 자막으로 되돌리기"
          className="mt-1 shrink-0 text-muted-foreground hover:text-foreground" onClick={() => onReset(clipId)}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
});
