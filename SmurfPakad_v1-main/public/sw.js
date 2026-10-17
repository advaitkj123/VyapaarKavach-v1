// SmurfPakad PWA Service Worker
// Caches core assets for offline use and intercepts API calls
const CACHE_NAME = 'smurfpakad-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/cryptoflow/dashboard',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network-first for API calls, cache-first for static assets
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline', message: 'SmurfPakad requires connection for live analysis' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
  } else {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request))
    );
  }
});

// Push notification for high-risk alerts
self.addEventListener('push', (event) => {
  const data = event.data?.json() || {};
  event.waitUntil(
    self.registration.showNotification('🚨 SmurfPakad Alert', {
      body: data.message || 'High-risk transaction detected',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: 'aml-alert',
      data: { url: '/cryptoflow/warroom' },
      actions: [
        { action: 'investigate', title: '🔍 Investigate' },
        { action: 'dismiss', title: 'Dismiss' },
      ],
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'investigate') {
    event.waitUntil(clients.openWindow('/cryptoflow/warroom'));
  }
});
