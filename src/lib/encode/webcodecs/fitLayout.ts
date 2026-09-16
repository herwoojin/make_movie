/** 원본을 출력 화면에 맞추는 배치. contain: 레터박스, cover: 가운데 잘라내기(쇼츠 세로) */
export function fitLayout(srcW: number, srcH: number, outW: number, outH: number, fit: 'contain' | 'cover') {
  const w = srcW > 0 ? srcW : outW;
  const h = srcH > 0 ? srcH : outH;
  const scale = fit === 'cover' ? Math.max(outW / w, outH / h) : Math.min(outW / w, outH / h);
  const sw = Math.round(w * scale);
  const sh = Math.round(h * scale);
  return { sw, sh, dx: Math.round((outW - sw) / 2), dy: Math.round((outH - sh) / 2) };
}
