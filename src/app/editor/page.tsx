import type { Metadata } from 'next';
import { StageTwoEntry } from '@/components/pipeline/StageTwoEntry';

export const metadata: Metadata = { title: '2단계 · 자막·영상 편집' };

export default function EditorEntryPage() {
  return <StageTwoEntry />;
}
