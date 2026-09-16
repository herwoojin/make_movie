/** @type {import('next').NextConfig} */

// Netlify에서는 정적 파일(/_next/static, /public)을 CDN이 직접 내주므로 그 헤더는 netlify.toml이 붙인다.
// 여기서도 붙이면 같은 헤더가 두 번 붙어("same-origin, same-origin") 브라우저가 무효로 처리할 수 있어 제외한다.
const onNetlify = process.env.NETLIFY === 'true';
const STATIC_PATHS = '_next/static|ffmpeg|ffmpeg-st|mediapipe|vendor|fonts|sample|sw\\.js';

const isolationHeaders = [
  // SharedArrayBuffer(ffmpeg-mt)는 cross-origin isolation 없이는 아예 생기지 않는다
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  // require-corp 대신 credentialless: HuggingFace 모델 CDN·Firebase API를 CORP 헤더 없이도 받기 위해
  { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
  { key: 'Cross-Origin-Resource-Policy', value: 'cross-origin' },
];

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    // /login 은 격리 헤더를 붙이지 않는다: COOP same-origin이면 Firebase Google 로그인 팝업과 통신이 끊긴다
    const excluded = onNetlify ? `login|${STATIC_PATHS}` : 'login';
    return [{ source: `/((?!${excluded}).*)`, headers: isolationHeaders }];
  },
  webpack: (config) => {
    config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
    // transformers.js의 Node 전용 백엔드가 브라우저 번들에 끌려오지 않게 한다
    config.resolve.alias = { ...config.resolve.alias, 'sharp$': false, 'onnxruntime-node$': false };
    return config;
  },
};
module.exports = nextConfig;
