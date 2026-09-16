import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ServerBattery } from '@/components/layout/ServerBattery';
import { ServiceWorkerRegister } from '@/components/layout/ServiceWorkerRegister';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { Toaster } from '@/components/layout/Toaster';
import { pretendard } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '편집ON — 설치 없는 무료 영상 편집기', template: '%s · 편집ON' },
  description: '무음·추임새 자동 컷, 자막 자동 생성, 얼굴 자동 모자이크까지. 영상은 서버로 올라가지 않고 브라우저 안에서만 처리됩니다.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  applicationName: '편집ON',
};

export const viewport: Viewport = {
  themeColor: '#0e1016',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className={`dark ${pretendard.variable}`}>
      <body className="min-h-screen font-sans">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
          본문으로 건너뛰기
        </a>
        <SiteHeader />
        <main id="main">{children}</main>
        <Toaster />
        <ServerBattery />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
