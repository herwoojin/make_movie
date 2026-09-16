'use client';

import { cn } from '@/lib/utils';

export function Segmented<T extends string | number>({
  label, value, options, onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-md bg-muted p-1">
        {options.map(([v, text]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v)}
            className={cn('flex-1 rounded px-2 py-1 text-xs transition-colors', value === v ? 'bg-background text-foreground shadow' : 'text-muted-foreground hover:text-foreground')}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-8 w-10 cursor-pointer rounded border bg-transparent" />
      <span>{label}</span>
      <span className="font-mono text-xs text-muted-foreground">{value}</span>
    </label>
  );
}
