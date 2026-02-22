/* ============================================================
   SW.JS — 서비스 워커 (오프라인 지원)
   ============================================================ */

const CACHE_NAME = 'thoughtspace-v2';

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/state.js',
  './js/render.js',
  './js/ui.js',
  './js/events.js',
  './js/persist.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@300;400;500;600&display=swap',
  'https://cdn.jsdelivr.net/npm/lucide/dist/umd/lucide.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/lz-string/1.4.4/lz-string.min.js',
];

// ── 설치: 캐시 저장 ───────────────────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // 외부 CDN은 실패해도 설치를 막지 않도록 개별 처리
      return cache.addAll(
        ASSETS.filter(url => !url.startsWith('http'))
      ).then(() => {
        const external = ASSETS.filter(url => url.startsWith('http'));
        return Promise.allSettled(
          external.map(url =>
            fetch(url, { mode: 'no-cors' })
              .then(res => cache.put(url, res))
              .catch(() => {}) // 외부 리소스 실패는 무시
          )
        );
      });
    }).then(() => self.skipWaiting()) // 즉시 활성화
  );
});

// ── 활성화: 이전 버전 캐시 삭제 ──────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim()) // 즉시 페이지 제어
  );
});

// ── Fetch: 캐시 우선, 실패 시 네트워크 ───────────────────────
self.addEventListener('fetch', e => {
  // POST 등 non-GET 요청은 그냥 통과
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      // 캐시 미스 → 네트워크 요청 후 캐시에 저장
      return fetch(e.request).then(res => {
        // 유효한 응답만 캐시 (opaque 포함)
        if (!res || res.status === 0 || (res.status >= 200 && res.status < 400)) {
          const toCache = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(e.request, toCache));
        }
        return res;
      }).catch(() => {
        // 네트워크도 실패하면 index.html fallback (SPA용)
        if (e.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
