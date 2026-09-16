'use client';

// "큰 버튼, 한국어 평문" 원칙(PRD 5장): 슬라이더 옆에 항상 무엇을 조절하는지 쉬운 설명을 붙인다.
import type { ReactNode } from 'react';
import { Slider } from './slider';

export function SliderField({
  label, hint, value, min, max, step = 1, format, onChange, onCommit, disabled,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  onCommit?: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="tabular-nums text-sm text-primary">{format ? format(value) : value}</span>
      </div>
      <Slider
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onValueChange={([v]) => onChange(v)}
        onValueCommit={([v]) => onCommit?.(v)}
      />
      {hint && <p className="text-xs leading-relaxed text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Section({ title, description, children, actions }: { title: string; description?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border bg-card/50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
