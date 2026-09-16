// 자막 캔버스 렌더용 폰트. next/font는 해시된 이름으로 등록되므로 캔버스가 'Pretendard'를 찾을 수 있게 따로 등록한다.
// 이걸 기다리지 않으면 첫 렌더에서 폴백 폰트로 그려져 미리보기와 결과가 달라진다.

export const SUBTITLE_FONT_URL = '/fonts/PretendardVariable.woff2';
export const SUBTITLE_FONT_TTF_URL = '/fonts/PretendardVariable.ttf';

let loading: Promise<void> | null = null;

export function ensureSubtitleFonts(): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const scope = globalThis as unknown as { fonts?: FontFaceSet; document?: Document; location?: Location };
    const fonts = scope.fonts ?? scope.document?.fonts;
    if (!fonts || typeof FontFace === 'undefined') return;
    try {
      const origin = scope.location?.origin ?? '';
      const face = new FontFace('Pretendard', `url(${origin}${SUBTITLE_FONT_URL})`, { weight: '45 920' });
      await face.load();
      fonts.add(face);
    } catch {
      // 폰트를 못 받으면 시스템 고딕으로 그린다 (미리보기와 내보내기 모두 같은 폴백을 쓰므로 어긋나지 않음)
    }
  })();
  return loading;
}
