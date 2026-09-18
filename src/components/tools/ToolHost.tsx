'use client';

import { AudioExtractTool } from './AudioExtractTool';
import { GifBatchTool } from './GifBatchTool';
import { ImageEditTool } from './ImageEditTool';
import { PhotoMosaicTool } from './PhotoMosaicTool';
import { ScreenRecorderTool } from './ScreenRecorderTool';

export function ToolHost({ tool }: { tool: string }) {
  switch (tool) {
    case 'gif': return <GifBatchTool />;
    case 'screen-gif': return <ScreenRecorderTool />;
    case 'audio': return <AudioExtractTool />;
    case 'image': return <ImageEditTool />;
    case 'photo-mosaic': return <PhotoMosaicTool />;
    default: return null;
  }
}
