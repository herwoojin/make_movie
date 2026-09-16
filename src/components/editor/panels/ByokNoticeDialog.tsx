'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/** BYOK 엔진 사용 직전 고지 (TRD 7장): 오디오가 외부 서버로 전송된다는 것을 매번 알린다 */
export function ByokNoticeDialog({ open, provider, onCancel, onConfirm }: { open: boolean; provider: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>오디오가 {provider} 서버로 전송됩니다</DialogTitle>
          <DialogDescription>
            지금 선택한 엔진은 인터넷 서비스({provider})입니다. 영상의 소리(오디오)만 {provider} 서버로 보내 글자로 바꿉니다.
            영상 화면은 보내지 않습니다. 원하지 않으면 &quot;브라우저 내장&quot; 엔진을 선택하세요.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>취소</Button>
          <Button onClick={onConfirm}>전송하고 자막 만들기</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
