const CACHE_NAME = 'tripflow-pwa-v1';
const APP_SHELL = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/logo.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return (
      (await caches.match('/offline.html')) ||
      new Response('Voce esta offline. Algumas informacoes do TripFlow podem nao estar disponiveis.', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        status: 503,
      })
    );
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const cacheableDestinations = new Set(['font', 'image', 'manifest', 'script', 'style', 'worker']);
  if (cacheableDestinations.has(request.destination) || url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirstAsset(request));
  }
});
