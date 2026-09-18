// 좌측 메뉴 한 곳에서 정의한다 (PRD-v2 F-02). 화면이 늘어날 때 여기만 고치면 메뉴·배지가 함께 따라온다.
import {
  EyeOff, FileClock, Film, FolderOpen, Languages, Minimize2, Mic2, Monitor, Music, Scissors, Settings, Subtitles, Download,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** 사이드카(내 컴퓨터 도우미)가 있어야 쓸 수 있는 기능 */
  sidecar?: boolean;
  /** 아직 만들지 않은 화면은 메뉴에 자리만 두고 눌리지 않게 한다 */
  planned?: boolean;
  step?: 1 | 2;
}

export interface NavSection {
  title?: string;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    items: [
      { href: '/tools/gif', label: '영상 GIF 변환', icon: Film },
      { href: '/tools/compress', label: '영상 용량 줄이기', icon: Minimize2 },
      { href: '/tools/screen-gif', label: '화면녹화 GIF', icon: Monitor },
    ],
  },
  {
    title: '영상편집도구',
    items: [
      { href: '/auto-edit', label: '1단계 · 음성 자동편집', icon: Scissors, step: 1 },
      { href: '/editor', label: '2단계 · 자막·영상 편집', icon: Subtitles, step: 2 },
      { href: '/dub', label: '영상에 소리 입히기', icon: Music },
      { href: '/mosaic', label: '영상 얼굴 모자이크', icon: EyeOff },
    ],
  },
  {
    title: '해외 영상 번역',
    items: [{ href: '/translate', label: '해외 영상 한국어 자막', icon: Languages }],
  },
  {
    title: 'AI 음성 도구',
    items: [{ href: '/tts', label: '내 목소리 TTS', icon: Mic2, sidecar: true }],
  },
  {
    title: '문서 도구',
    items: [{ href: '/tools/youtube', label: '유튜브 영상 추출', icon: Download, sidecar: true }],
  },
  {
    items: [
      { href: '/recent', label: '최근 저장 결과', icon: FileClock },
      { href: '/projects', label: '내 프로젝트', icon: FolderOpen },
      { href: '/settings', label: '설정', icon: Settings },
    ],
  },
];

/** 지금 보고 있는 경로가 어느 메뉴인지 (하이라이트용) */
export function isActivePath(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/editor') return pathname.startsWith('/editor');
  if (href === '/tools/gif') return pathname === '/tools' || pathname === '/tools/gif';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 우측 상단 스텝 표시 (PRD-v2 F-02-4) */
export function currentStage(pathname: string | null): 1 | 2 | null {
  if (!pathname) return null;
  if (pathname.startsWith('/auto-edit') || pathname.startsWith('/translate')) return 1;
  if (pathname.startsWith('/editor')) return 2;
  return null;
}
