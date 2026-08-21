'use client';

import { useEffect, useState } from 'react';

export default function SyncStatus() {
  // `navigator` não existe no SSR — assume online e corrige no client via useEffect.
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const markSyncing = () => setSyncing(true);
    window.addEventListener('fetch', markSyncing);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('fetch', markSyncing);
    };
  }, []);

  const text = !online ? 'offline' : syncing ? 'sincronizando…' : 'sincronizado';
  const color = !online ? 'var(--alert)' : syncing ? 'var(--fg)' : 'var(--dim)';
  return (
    <span style={{ color, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{text}</span>
  );
}
