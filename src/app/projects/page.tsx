import type { Metadata } from 'next';
import { ProjectsView } from '@/components/projects/ProjectsView';

export const metadata: Metadata = { title: '프로젝트' };

export default function ProjectsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <ProjectsView />
    </div>
  );
}
