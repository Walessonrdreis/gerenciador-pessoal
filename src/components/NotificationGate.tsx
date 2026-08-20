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

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length); // lib es2024: ArrayBufferLike por padrão — alocação com ArrayBuffer real
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}
