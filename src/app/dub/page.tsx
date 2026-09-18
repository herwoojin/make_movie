import type { Metadata } from 'next';
import { DubView } from '@/components/dub/DubView';

export const metadata: Metadata = { title: '영상에 소리 입히기' };

export default function DubPage() {
  return <DubView />;
}
