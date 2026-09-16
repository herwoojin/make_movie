// 편집ON 오프라인 셸. 모든 처리가 브라우저 안에서 끝나므로, 앱 코드와 wasm만 캐시되면 오프라인에서도 편집할 수 있다.
const CACHE = 'editon-v1';
const SHELL = ['/', '/projects', '/tools', '/settings', '/help', '/manifest.webmanifest', '/icon.svg'];
const STATIC = /^\/(_next\/static|ffmpeg|ffmpeg-st|mediapipe|fonts|sample)\//;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // 페이지는 네트워크 우선: COOP/COEP 헤더가 최신으로 유지되어야 cross-origin isolation이 깨지지 않는다
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/'))),
    );
    return;
  }

  // 해시가 붙은 정적 파일·wasm은 캐시 우선
  if (STATIC.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
  }
});
