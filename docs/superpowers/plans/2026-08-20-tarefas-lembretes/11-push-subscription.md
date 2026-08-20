# Task 11: Push — VAPID, subscribe do aparelho, service worker

**Files:**
- Create: `src/app/api/push/subscribe/route.ts` (POST, DELETE)
- Create: `src/components/NotificationGate.tsx`
- Create: `public/sw.js`
- Create: `src/lib/push.ts`
- Modify: `src/app/(app)/layout.tsx` (montar `NotificationGate`)

**Interfaces:**
- Consumes: `getAuthUserId`, `prisma`
- Produces:
  - `src/lib/push.ts`: `ensureVapid()`, `sendPushToUser(userId: string, payload: PushPayload): Promise<{ sent: number; total: number }>`
  - `POST /api/push/subscribe` body `{ endpoint, p256dh, auth }` → upsert `PushSubscription`
  - `DELETE /api/push/subscribe` body `{ endpoint }` → remove
  - `public/sw.js` — trata `push` e `notificationclick`

- [ ] **Step 1: Gerar chaves VAPID**

```bash
npx web-push generate-vapid-keys
# cole VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY no .env; VAPID_SUBJECT=mailto:seu@email.com
```

- [ ] **Step 2: Lib de push**

`src/lib/push.ts`:

```ts
import webpush from 'web-push';
import { prisma } from '@/lib/db';

let configured = false;

export function ensureVapid() {
  if (configured) return;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';
  if (!publicKey || !privateKey) {
    throw new Error('VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configurados');
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

export interface PushPayload {
  title: string;
  body: string;
  id: string;
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  ensureVapid();
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload)
      )
    )
  );
  const ok = results.filter((r) => r.status === 'fulfilled').length;
  return { sent: ok, total: subs.length };
}
```

- [ ] **Step 3: Rotas de subscribe**

`src/app/api/push/subscribe/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { z } from 'zod';

const subSchema = z.object({
  endpoint: z.string().url().min(20),
  p256dh: z.string().min(10),
  auth: z.string().min(10),
});

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const parsed = subSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'subscription inválida' }, { status: 400 });

  const { endpoint, p256dh, auth } = parsed.data;
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh, auth },
    create: { userId, endpoint, p256dh, auth },
  });
  return NextResponse.json({ id: sub.id });
}

export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: 'endpoint é obrigatório' }, { status: 400 });

  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Service worker**

`public/sw.js`:

```js
const CACHE = 'gestor-v1';
const SHELL = ['/', '/lista', '/concluidas', '/calendario', '/manifest.webmanifest', '/entrar'];

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
```

- [ ] **Step 5: NotificationGate (permissão + registro)**

`src/components/NotificationGate.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiDelete, apiPost } from '@/lib/api';

export default function NotificationGate() {
  const [status, setStatus] = useState<'idle' | 'denied' | 'on' | 'off'>('idle');

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  useEffect(() => {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') setStatus('on');
    if (Notification.permission === 'denied') setStatus('denied');
  }, []);

  const enable = async () => {
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      setStatus('denied');
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array((window as unknown as { __VAPID_PUBLIC__: string }).__VAPID_PUBLIC__),
    });
    await apiPost('/api/push/subscribe', {
      endpoint: sub.endpoint,
      p256dh: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('p256dh')!))),
      auth: btoa(String.fromCharCode(...new Uint8Array(sub.getKey('auth')!))),
    });
    setStatus('on');
  };

  const disable = async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      await apiDelete('/api/push/subscribe', { endpoint: sub.endpoint });
      await sub.unsubscribe();
    }
    setStatus('off');
  };

  if (status === 'on' || status === 'denied' || status === 'off') {
    return (
      <button
        onClick={status === 'on' ? disable : enable}
        style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--dim)', padding: '8px 14px', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}
      >
        {status === 'on' ? 'notificações: ligadas [desligar]' : status === 'denied' ? 'notificações: bloqueadas' : 'notificações: desligadas [ligar]'}
      </button>
    );
  }
  return (
    <button onClick={enable} style={{ background: 'var(--accent)', border: 'none', color: 'var(--bg)', padding: '8px 14px', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 'bold', cursor: 'pointer' }}>
      [ativar notificações]
    </button>
  );
}

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
```

Monte o `NotificationGate` no rodapé do `src/app/(app)/layout.tsx` (dentro do `<main className="content">`, após `{children}`) e exponha a chave pública no layout raiz (`src/app/layout.tsx`):

```tsx
<script dangerouslySetInnerHTML={{ __html: `window.__VAPID_PUBLIC__ = "${process.env.VAPID_PUBLIC_KEY ?? ''}";` }} />
```

- [ ] **Step 6: Testar no navegador**

Run: `npm run dev` → HTTPS local opcional; em `http://localhost`, push manager pode recusar em alguns navegadores (Chrome exige secure context — `localhost` conta como secure context, ok). Clique em ativar → permissão → subscription salva. Verifique no banco com `npx prisma studio` que `PushSubscription` foi criada.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/push public/sw.js src/components/NotificationGate.tsx src/lib/push.ts src/app/layout.tsx src/app/\(app\)/layout.tsx && git commit -m "feat: push subscription (vapid + service worker)"
```
