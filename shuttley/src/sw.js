import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// ── Offline fallback: serve cached index.html for navigation requests ────────
self.addEventListener('fetch', event => {
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/index.html')
      )
    )
  }
})

// ── Cache images ─────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  if (event.request.destination === 'image') {
    event.respondWith(
      caches.open('images-v1').then(cache =>
        cache.match(event.request).then(cached => {
          if (cached) return cached
          return fetch(event.request).then(response => {
            cache.put(event.request, response.clone())
            return response
          })
        })
      )
    )
  }
})

// ── Push notification handler ───────────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {}
  try { data = event.data?.json() ?? {} } catch (_) { data = { body: event.data?.text() } }
  const title = data.title || 'Shuttley'
  const options = {
    body: data.body || '',
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    data: { url: data.url || '/' },
    vibrate: [200, 100, 200],
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Notification click: open or focus the app ───────────────────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close()
  const url = event.notification.data?.url || '/'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => 'focus' in c)
      if (existing) { existing.postMessage({ type: 'navigate', url }); return existing.focus() }
      return self.clients.openWindow(url)
    })
  )
})
