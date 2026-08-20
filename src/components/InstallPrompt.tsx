'use client';

import { useEffect, useState } from 'react';

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<{ prompt: () => Promise<unknown> } | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const beforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as unknown as { prompt: () => Promise<unknown> });
    };
    const installedEvent = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', installedEvent);
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', installedEvent);
    };
  }, []);

  if (!deferred || installed) return null;

  return (
    <button
      onClick={async () => {
        await deferred.prompt();
        setDeferred(null);
      }}
      style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--dim)', padding: '8px 14px', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', cursor: 'pointer' }}
    >
      [instalar na tela inicial]
    </button>
  );
}
