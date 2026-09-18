import type { Metadata } from 'next';
import { TranslateView } from '@/components/translate/TranslateView';

export const metadata: Metadata = { title: '1단계 · 해외 영상 한국어 자막' };

export default function TranslatePage() {
  return <TranslateView />;
}
