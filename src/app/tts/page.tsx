import type { Metadata } from 'next';
import { TtsView } from '@/components/tts/TtsView';

export const metadata: Metadata = { title: '내 목소리 TTS' };

export default function TtsPage() {
  return <TtsView />;
}
