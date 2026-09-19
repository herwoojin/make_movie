'use client';

// 배포 사이트에서 도우미에 붙을 때 Chrome이 묻는 "로컬 네트워크 액세스" 권한 안내.
// 허용 창을 놓쳤거나 차단했으면 "연결되지 않음"만 보여 이유를 알 수 없으므로, 무엇을 누르면 되는지 알려 준다.
import { ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { localNetworkPermission, needsLocalNetworkPermission, type LocalNetworkState } from '@/lib/sidecar/networkPermission';

export function LocalNetworkHint({ onGranted }: { onGranted: () => void }) {
  const [state, setState] = useState<LocalNetworkState | null>(null);

  useEffect(() => {
    if (!needsLocalNetworkPermission()) return undefined;
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (!status) return;
      setState(status.state as LocalNetworkState);
      // 사용자가 허용으로 바꾸면 바로 다시 연결해 본다
      if (status.state === 'granted') onGranted();
    };
    void localNetworkPermission().then((r) => {
      setState(r.state);
      status = r.status;
      status?.addEventListener('change', onChange);
    });
    return () => status?.removeEventListener('change', onChange);
  }, [onGranted]);

  if (state === 'denied') {
    return (
      <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs" role="alert">
        <p className="flex items-center gap-1.5 font-medium text-amber-200">
          <ShieldAlert className="h-4 w-4" aria-hidden /> Chrome이 이 사이트의 내 컴퓨터 접속을 막았습니다
        </p>
        <ol className="list-decimal space-y-0.5 pl-4 text-muted-foreground">
          <li>주소창 왼쪽의 사이트 정보 아이콘을 누릅니다.</li>
          <li><b className="text-foreground">로컬 네트워크 액세스</b>(또는 “이 기기의 다른 앱 및 서비스”)를 <b className="text-foreground">허용</b>으로 바꿉니다.</li>
          <li>이 창으로 돌아오면 자동으로 다시 연결합니다. 안 되면 “다시 확인”을 누르세요.</li>
        </ol>
      </div>
    );
  }

  if (state === 'prompt') {
    return (
      <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
        처음 연결할 때 Chrome이 <b className="text-foreground">“이 기기의 다른 앱 및 서비스에 액세스”</b>를 허용할지 묻습니다.
        도우미에 연결하려면 <b className="text-foreground">허용</b>을 눌러 주세요. (인터넷에 올린 사이트가 내 컴퓨터에 접속할 때만 묻습니다)
      </p>
    );
  }

  return null;
}
