'use client';

import { EyeOff, Film, Image as ImageIcon, Monitor, Music } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { AudioExtractTool } from './AudioExtractTool';
import { GifBatchTool } from './GifBatchTool';
import { ImageEditTool } from './ImageEditTool';
import { PhotoMosaicTool } from './PhotoMosaicTool';
import { ScreenRecorderTool } from './ScreenRecorderTool';

const TOOLS = [
  { id: 'gif', label: 'GIF 일괄 변환', desc: '영상 여러 개를 한 번에 움짤로', icon: Film },
  { id: 'record', label: '화면 녹화', desc: '녹화해서 바로 영상·GIF로', icon: Monitor },
  { id: 'audio', label: '오디오 추출', desc: '영상에서 소리만 WAV·MP3로', icon: Music },
  { id: 'image', label: '이미지 편집', desc: '크기·자르기·회전·용량 줄이기', icon: ImageIcon },
  { id: 'photo-mosaic', label: '사진 얼굴 가리기', desc: '여러 장 자동 모자이크 + ZIP', icon: EyeOff },
] as const;

type ToolId = (typeof TOOLS)[number]['id'];

export function ToolsView() {
  const [tool, setTool] = useState<ToolId>('gif');
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">도구함</h1>
        <p className="text-sm text-muted-foreground">편집기와 따로 쓰는 작은 도구들입니다. 모든 파일은 이 컴퓨터 안에서만 처리됩니다.</p>
      </div>
      <div role="tablist" aria-label="도구 선택" className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {TOOLS.map(({ id, label, desc, icon: Icon }) => (
          <button key={id} type="button" role="tab" aria-selected={tool === id} onClick={() => setTool(id)}
            className={cn('rounded-xl border p-3 text-left transition-colors', tool === id ? 'border-primary bg-primary/10' : 'bg-card hover:border-primary/60')}>
            <Icon className="h-5 w-5 text-primary" aria-hidden />
            <p className="mt-2 text-sm font-semibold">{label}</p>
            <p className="text-xs text-muted-foreground">{desc}</p>
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tool === 'gif' && <GifBatchTool />}
        {tool === 'record' && <ScreenRecorderTool />}
        {tool === 'audio' && <AudioExtractTool />}
        {tool === 'image' && <ImageEditTool />}
        {tool === 'photo-mosaic' && <PhotoMosaicTool />}
      </div>
    </div>
  );
}
