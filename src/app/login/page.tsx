import type { Metadata } from 'next';
import { LoginView } from '@/components/auth/LoginView';

export const metadata: Metadata = { title: '로그인' };

// 이 페이지만 COOP/COEP 격리 헤더 없이 제공된다 (next.config.js). Firebase Google 팝업 로그인에 필요.
export default function LoginPage() {
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <LoginView />
    </div>
  );
}
