'use client';

import { useSearchParams } from 'next/navigation';
import { StageOneEntry } from './StageOneEntry';
import { StageOneView } from './StageOneView';

export function AutoEditRoute() {
  const projectId = useSearchParams().get('project');
  return projectId ? <StageOneView projectId={projectId} /> : <StageOneEntry />;
}
