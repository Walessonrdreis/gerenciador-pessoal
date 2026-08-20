const CACHE = 'gestor-v1';
// /manifest.webmanifest e /icons/* entram quando a Task 13 criar o manifest —
// cache.addAll falha (404) e quebra a instalação do SW se listar o que não existe.
const SHELL = ['/', '/lista', '/concluidas', '/calendario', '/entrar'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (url.origin === location.origin && (url.pathname === '/' || url.pathname === '/lista' || url.pathname === '/concluidas' || url.pathname === '/calendario')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }
  if (url.origin === location.origin && url.pathname.startsWith('/_next/static')) {
    event.respondWith(
      caches.match(event.request).then((hit) => hit ?? fetch(event.request))
    );
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'gestor pessoal', body: '', id: '' };
  try {
    data = event.data.json();
  } catch {
    /* corpo não-JSON ignora */
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'gestor pessoal', {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.id,
      // som padrão do aparelho (Web Push toca o som do sistema; repetição via re-push)
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ('focus' in client) return client.focus();
      }
      return clients.openWindow('/');
    })
  );
});
