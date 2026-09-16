// 이미지 편집 도구의 기하 계산 (순수 함수). 캔버스 조작과 분리해 테스트한다.

export type Rotation = 0 | 90 | 180 | 270;

export interface CropPercent { left: number; top: number; right: number; bottom: number }

export interface ImageEditParams {
  rotation: Rotation;
  flipX: boolean;
  crop: CropPercent;
  /** 결과 가로 크기(px). 0이면 원본 비율 그대로 */
  targetWidth: number;
}

export interface ImagePlan {
  source: { x: number; y: number; w: number; h: number };
  output: { width: number; height: number };
  scale: number;
}

const clamp01 = (v: number) => Math.min(0.95, Math.max(0, v));

export function planImageEdit(srcW: number, srcH: number, p: ImageEditParams): ImagePlan {
  const left = clamp01(p.crop.left);
  const top = clamp01(p.crop.top);
  const right = Math.min(1 - left - 0.05, clamp01(p.crop.right));
  const bottom = Math.min(1 - top - 0.05, clamp01(p.crop.bottom));
  const sx = Math.round(srcW * left);
  const sy = Math.round(srcH * top);
  const sw = Math.max(1, Math.round(srcW * (1 - left - right)));
  const sh = Math.max(1, Math.round(srcH * (1 - top - bottom)));
  const rotated = p.rotation === 90 || p.rotation === 270;
  const rw = rotated ? sh : sw;
  const rh = rotated ? sw : sh;
  const scale = p.targetWidth > 0 ? p.targetWidth / rw : 1;
  return {
    source: { x: sx, y: sy, w: sw, h: sh },
    output: { width: Math.max(1, Math.round(rw * scale)), height: Math.max(1, Math.round(rh * scale)) },
    scale,
  };
}

export function outputFileName(name: string, format: 'jpeg' | 'png' | 'webp'): string {
  const base = name.replace(/\.[^.]+$/, '');
  return `${base}_편집ON.${format === 'jpeg' ? 'jpg' : format}`;
}
