'use client';

// 자막 언어 — 해외 영상 한국어 자막(1단계)에서 번역한 한국어를 미리보기·자막 넣은 영상·자막 파일에 쓸지, 원어를 쓸지.
import { Languages } from 'lucide-react';
import Link from 'next/link';
import { Section } from '@/components/ui/field';
import { Segmented } from '@/components/ui/segmented';
import type { CaptionLang } from '@/types/models';
import { useProjectStore } from '@/store/projectStore';

const OPTIONS: readonly (readonly [CaptionLang, string])[] = [['translated', '한국어 (번역)'], ['original', '원어']];

export function CaptionLangBox() {
  const lang = useProjectStore((s) => s.doc.view.captionLang);
  const projectId = useProjectStore((s) => s.project?.id ?? '');
  const fromTranslate = useProjectStore((s) => s.project?.sourceTool === 'translate');
  const total = useProjectStore((s) => s.doc.clips.length);
  const translated = useProjectStore((s) => s.doc.clips.filter((c) => c.translatedText?.trim()).length);

  // 번역과 상관없는 프로젝트에는 보이지 않는다
  if (!fromTranslate && translated === 0) return null;

  return (
    <Section title="자막 언어" description="미리보기·자막 넣은 영상·자막 파일(SRT/VTT)에 이 언어로 나갑니다. 가운데 목록의 “한국어” 줄에서 번역을 직접 고칠 수 있습니다.">
      <Segmented label="보여 줄 자막" value={lang} options={OPTIONS}
        onChange={(v) => useProjectStore.getState().setView({ captionLang: v })} />
      <p className="text-xs text-muted-foreground">
        번역된 줄 {translated}/{total}줄{lang === 'translated' && translated < total ? ' — 번역이 없는 줄은 원어로 나갑니다.' : ''}
      </p>
      {translated < total && projectId && (
        <Link href={`/translate?project=${projectId}`}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent">
          <Languages className="h-3.5 w-3.5" aria-hidden /> 번역 안 된 {total - translated}줄 이어서 번역하기
        </Link>
      )}
    </Section>
  );
}
