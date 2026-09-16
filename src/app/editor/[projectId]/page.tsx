import type { Metadata } from 'next';
import { EditorShell } from '@/components/editor/EditorShell';

export const metadata: Metadata = { title: '편집' };

export default function EditorPage({ params }: { params: { projectId: string } }) {
  return <EditorShell projectId={params.projectId} />;
}
