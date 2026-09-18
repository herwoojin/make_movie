'use client';

import { AudioExtractTool } from './AudioExtractTool';
import { CompressTool } from './CompressTool';
import { GifBatchTool } from './GifBatchTool';
import { ImageEditTool } from './ImageEditTool';
import { PhotoMosaicTool } from './PhotoMosaicTool';
import { ScreenRecorderTool } from './ScreenRecorderTool';
import { YoutubeTool } from './YoutubeTool';

export function ToolHost({ tool }: { tool: string }) {
  switch (tool) {
    case 'gif': return <GifBatchTool />;
    case 'compress': return <CompressTool />;
    case 'screen-gif': return <ScreenRecorderTool />;
    case 'audio': return <AudioExtractTool />;
    case 'image': return <ImageEditTool />;
    case 'photo-mosaic': return <PhotoMosaicTool />;
    case 'youtube': return <YoutubeTool />;
    default: return null;
  }
}
