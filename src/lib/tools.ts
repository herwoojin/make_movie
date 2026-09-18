// 도구함 목록 한 곳 정의 — /tools 카드와 /tools/[tool] 라우트가 같은 목록을 쓴다.
import { Download, EyeOff, Film, Image as ImageIcon, Minimize2, Monitor, Music, type LucideIcon } from 'lucide-react';

export interface ToolDef {
  id: string;
  label: string;
  desc: string;
  icon: LucideIcon;
}

export const TOOLS: ToolDef[] = [
  { id: 'gif', label: '영상 GIF 변환', desc: '영상 여러 개를 한 번에 움짤로', icon: Film },
  { id: 'compress', label: '영상 용량 줄이기', desc: '목표 용량이나 화질 프리셋으로', icon: Minimize2 },
  { id: 'screen-gif', label: '화면녹화 GIF', desc: '녹화해서 바로 영상·GIF로', icon: Monitor },
  { id: 'youtube', label: '유튜브 영상 추출', desc: '주소를 넣으면 받아서 바로 편집 (도우미 필요)', icon: Download },
  { id: 'audio', label: '오디오 추출', desc: '영상에서 소리만 WAV·MP3로', icon: Music },
  { id: 'image', label: '이미지 편집', desc: '크기·자르기·회전·용량 줄이기', icon: ImageIcon },
  { id: 'photo-mosaic', label: '사진 얼굴 가리기', desc: '여러 장 자동 모자이크 + ZIP', icon: EyeOff },
];

export function getTool(id: string): ToolDef | undefined {
  return TOOLS.find((t) => t.id === id);
}
