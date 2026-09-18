'use client';

// 유튜브 영상 받기 (F-09). 내 컴퓨터 도우미(yt-dlp)가 있을 때만 동작한다.
import { Download, Scissors, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ElapsedTimer } from '@/components/common/ElapsedTimer';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Section } from '@/components/ui/field';
import { Input, Label, NativeSelect, Progress, Switch } from '@/components/ui/misc';
import { createProjectFromFile } from '@/lib/editor/importPipeline';
import { sidecar } from '@/lib/sidecar/client';
import { useSidecar } from '@/lib/sidecar/useSidecar';
import { settings } from '@/lib/settings';
import { recordSavedResult } from '@/lib/storage/savedResults';
import { formatBytes } from '@/lib/utils';
import { useUiStore } from '@/store/uiStore';

const QUALITIES: [string, string][] = [
  ['1080p', '1080p 이하'],
  ['720p', '720p 이하'],
  ['best', '최고 화질'],
  ['audio', '오디오만 (WAV)'],
];

export function YoutubeTool() {
  const router = useRouter();
  const { ready, features } = useSidecar();
  const [url, setUrl] = useState('');
  const [quality, setQuality] = useState('1080p');
  const [notice, setNotice] = useState(false);
  const [dontAsk, setDontAsk] = useState(false);
  const [busy, setBusy] = useState<{ ratio: number; message: string; startedAt: number } | null>(null);
  const [done, setDone] = useState<{ filePath: string; title: string; fileSize: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const usable = ready && features.ytdlp;

  useEffect(() => setDontAsk(settings.getYoutubeNoticeSeen()), []);

  const download = async () => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const startedAt = Date.now();
    setBusy({ ratio: 0, message: '준비 중', startedAt });
    setDone(null);
    useUiStore.getState().setStatus({ kind: 'busy', text: '유튜브 영상을 받는 중…', startedAt });
    try {
      const result = await sidecar.downloadYoutube(
        { url: url.trim(), quality },
        (d, t, message) => setBusy({ ratio: t > 0 ? d / t : 0, message: message ?? '내려받는 중', startedAt }),
        ctrl.signal,
      );
      const info = { filePath: result.filePath, title: result.title, fileSize: (result as { fileSize?: number }).fileSize ?? 0 };
      setDone(info);
      await recordSavedResult(
        { blob: new Blob(), fileName: info.title, kind: quality === 'audio' ? 'audio' : 'video', toolId: 'youtube', keepCopy: false },
        { method: 'sidecar', location: info.filePath, localPath: info.filePath },
      );
      useUiStore.getState().setStatus({ kind: 'done', text: `저장 완료 · ${info.filePath}`, hint: info.filePath });
    } catch (e) {
      useUiStore.getState().showError(e);
    } finally {
      setBusy(null);
    }
  };

  /** 도우미가 받아 둔 파일을 브라우저로 가져와 편집 프로젝트로 만든다 */
  const sendToEditor = async () => {
    if (!done) return;
    try {
      setBusy({ ratio: 0, message: '편집기로 가져오는 중', startedAt: Date.now() });
      const file = await sidecar.readFile(done.filePath);
      const { projectId } = await createProjectFromFile(file, (p) => setBusy((b) => (b ? { ...b, ratio: p.ratio, message: p.label } : b)), undefined, {
        sourceTool: 'import', pipelineStage: 1,
      });
      router.push(`/auto-edit?project=${projectId}`);
    } catch (e) {
      useUiStore.getState().showError(e);
      setBusy(null);
    }
  };

  const start = () => {
    if (settings.getYoutubeNoticeSeen()) void download();
    else setNotice(true);
  };

  return (
    <div className="space-y-4">
      {!usable && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <p className="font-medium">내 컴퓨터 도우미가 필요합니다</p>
          <p className="mt-0.5 text-muted-foreground">
            브라우저만으로는 유튜브 영상을 받을 수 없습니다. 터미널에서 <code className="rounded bg-muted px-1">npx editon-helper</code> 를 실행하고
            설정 화면에 토큰을 넣으면 이 기능이 켜집니다.
          </p>
        </div>
      )}

      <Section title="주소와 화질">
        <div className="space-y-1">
          <Label htmlFor="yt-url" className="text-xs">유튜브 주소</Label>
          <Input id="yt-url" value={url} disabled={!usable} placeholder="https://www.youtube.com/watch?v=..."
            onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="yt-quality" className="text-xs">화질</Label>
          <NativeSelect id="yt-quality" className="h-9 w-48" value={quality} disabled={!usable} onChange={(e) => setQuality(e.target.value)}>
            {QUALITIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </NativeSelect>
        </div>

        {busy ? (
          <div className="space-y-2" role="status" aria-live="polite">
            <p className="text-sm">{busy.message}</p>
            <Progress value={busy.ratio * 100} aria-label="내려받기 진행률" />
            <div className="flex items-center justify-between">
              <ElapsedTimer startedAt={busy.startedAt} className="text-xs tabular-nums text-muted-foreground" />
              <Button size="sm" variant="outline" onClick={() => abortRef.current?.abort()}><X /> 취소</Button>
            </div>
          </div>
        ) : (
          <Button disabled={!usable || !url.trim()} onClick={start}><Download /> 받기</Button>
        )}
      </Section>

      {done && (
        <Section title="받았습니다" description={done.filePath}>
          <p className="text-sm">{done.title}{done.fileSize > 0 && ` · ${formatBytes(done.fileSize)}`}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void sendToEditor()}><Scissors /> 1단계 자동편집으로 보내기</Button>
            <Button size="sm" variant="secondary" onClick={() => void sidecar.openFolder(done.filePath)}>폴더 열기</Button>
          </div>
        </Section>
      )}

      <Dialog open={notice} onOpenChange={(o) => !o && setNotice(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>내려받기 전에 확인해 주세요</DialogTitle>
            <DialogDescription>
              본인이 권리를 가진 영상이나 이용이 허용된 범위 내에서 사용하세요. 각 플랫폼 이용약관 확인은 사용자 책임입니다.
            </DialogDescription>
          </DialogHeader>
          <label className="flex items-center justify-between text-sm">
            다시 보지 않기
            <Switch checked={dontAsk} onCheckedChange={setDontAsk} aria-label="다시 보지 않기" />
          </label>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNotice(false)}>취소</Button>
            <Button onClick={() => { if (dontAsk) settings.setYoutubeNoticeSeen(true); setNotice(false); void download(); }}>이해했습니다</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
