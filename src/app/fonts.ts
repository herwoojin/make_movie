import localFont from 'next/font/local';

// Google Fonts CDN은 COEP에 막히므로 반드시 self-host (TRD 2장 의존성 최소 원칙)
export const pretendard = localFont({
  src: [{ path: '../../public/fonts/PretendardVariable.woff2', weight: '45 920', style: 'normal' }],
  variable: '--font-pretendard',
  display: 'swap',
  fallback: ['system-ui', 'Apple SD Gothic Neo', 'Malgun Gothic', 'sans-serif'],
});
