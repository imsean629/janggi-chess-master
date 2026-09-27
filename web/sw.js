// 오프라인에서도 열리도록 앱 파일을 캐시한다. 파일을 고치면 VERSION을 올릴 것.
const VERSION = 'master-v6';
const FILES = ['./', 'index.html', 'style.css', 'janggi.html', 'janggi-engine.js', 'janggi-app.js', 'chess.html', 'chess-engine.js', 'chess-app.js',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // 네트워크 우선(최신 유지) → 실패 시 캐시
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
