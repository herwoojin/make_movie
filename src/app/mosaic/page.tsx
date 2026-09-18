import type { Metadata } from 'next';
import { MosaicEntry } from '@/components/pipeline/MosaicEntry';

export const metadata: Metadata = { title: '영상 얼굴 모자이크' };

export default function MosaicPage() {
  return <MosaicEntry />;
}
