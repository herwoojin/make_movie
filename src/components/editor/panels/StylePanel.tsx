'use client';

import { StyleControls } from './StyleControls';
import { StylePresets } from './StylePresets';

export function StylePanel() {
  return (
    <>
      <p className="text-xs text-muted-foreground">
        바꾸는 즉시 미리보기에 보입니다. 미리보기와 내보낸 영상은 같은 그리기 함수를 쓰므로 모양이 같게 나옵니다.
      </p>
      <StylePresets />
      <StyleControls />
    </>
  );
}
