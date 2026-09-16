'use client';

import { BookA, FolderSync, Palette } from 'lucide-react';
import { useState } from 'react';
import { buttonVariants, Button } from '@/components/ui/button';
import { Section } from '@/components/ui/field';
import { formatDuration } from '@/lib/core/timecode';
import { LOGIN_PATH } from '@/lib/firebase/config';
import type { ProjectMetaDoc } from '@/lib/firebase/schema';
import { listRemoteProjectMeta, pushProjectMeta, syncFillers, syncPresets } from '@/lib/firebase/sync';
import { useAuth } from '@/lib/firebase/useAuth';
import { formatRelative } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

export function AccountBox() {
  const { user, ready, configured } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [remote, setRemote] = useState<ProjectMetaDoc[] | null>(null);

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      useUiStore.getState().toast({ kind: 'success', title: await fn() });
    } catch (e) {
      useUiStore.getState().showError(e);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Section title="계정 · 동기화 (선택)" description="Google 계정으로 로그인하면 아래 항목을 다른 컴퓨터와 맞출 수 있습니다. 영상·오디오·자막 내용은 올라가지 않으며, 버튼을 누를 때만 동기화합니다.">
      {!configured ? (
        <p className="text-sm text-muted-foreground">
          이 사이트에는 Firebase가 설정되지 않았습니다. 모든 기능은 로그인 없이 동작합니다. (설정 방법: docs/GUIDE.md 6장)
        </p>
      ) : !ready ? (
        <p className="text-sm text-muted-foreground">로그인 상태 확인 중…</p>
      ) : !user ? (
        <a href={`${LOGIN_PATH}?next=/settings`} className={buttonVariants({ size: 'sm' })}>Google 계정으로 로그인하러 가기</a>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">{user.displayName ?? user.email} 계정으로 로그인됨</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!!busy} onClick={() => void run('presets', async () => {
              const r = await syncPresets();
              return `프리셋 동기화 완료 (올림 ${r.pushed}개 · 받음 ${r.pulled}개)`;
            })}><Palette /> 자막 프리셋 동기화</Button>
            <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => void run('fillers', async () => {
              const r = await syncFillers();
              return r === 'pulled' ? '다른 기기의 추임새 사전을 받았습니다.' : r === 'pushed' ? '이 기기의 추임새 사전을 올렸습니다.' : '추임새 사전이 이미 같습니다.';
            })}><BookA /> 추임새 사전 동기화</Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run('meta', async () => {
              const n = await pushProjectMeta();
              setRemote(await listRemoteProjectMeta());
              return `프로젝트 기록 ${n}개를 올렸습니다. (영상은 올라가지 않습니다)`;
            })}><FolderSync /> 프로젝트 목록 기록 올리기</Button>
          </div>
          {remote && (
            <ul className="divide-y rounded-md border text-sm">
              {remote.map((m) => (
                <li key={`${m.deviceLabel}-${m.localId}`} className="flex justify-between gap-2 px-3 py-2">
                  <span className="truncate">{m.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{formatDuration(m.durationMs)} · {m.deviceLabel} · {formatRelative(m.updatedAtMs)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Section>
  );
}
