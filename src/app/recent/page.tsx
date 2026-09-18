import type { Metadata } from 'next';
import { RecentView } from '@/components/recent/RecentView';

export const metadata: Metadata = { title: '최근 저장 결과' };

export default function RecentPage() {
  return <RecentView />;
}
