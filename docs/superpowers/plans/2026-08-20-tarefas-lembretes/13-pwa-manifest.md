# Task 13: PWA — manifest, ícones, instalação

**Files:**
- Create: `src/app/manifest.ts`
- Create: `scripts/generate-icons.mjs`
- Create: `public/icons/` (gerado pelo script)
- Create: `src/components/InstallPrompt.tsx`
- Modify: `package.json` (script `icons`)
- Modify: `src/app/(app)/layout.tsx` (montar `InstallPrompt`)

**Interfaces:**
- Produces: manifest funcional (`/manifest.webmanifest`) + `public/icons/icon-192.png`, `icon-512.png`, `maskable-512.png`; o app instalável no celular

- [ ] **Step 1: Script de ícones (sharp rasteriza SVG puro — sem dependência de fonte)**

`scripts/generate-icons.mjs`:

```js
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

mkdirSync('public/icons', { recursive: true });

function svg(size) {
  const s = size * 0.24; // stroke
  const c = size * 0.08; // margin
  const box = size * 0.72;
  const x = (size - box) / 2;
  return `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#0f1110"/>
    <rect x="${x}" y="${x}" width="${box}" height="${box}" rx="${size * 0.06}" fill="none" stroke="#7fd88f" stroke-width="${s}"/>
    <path d="M ${x + box * 0.22} ${size * 0.52} L ${x + box * 0.42} ${size * 0.66} L ${x + box * 0.78} ${size * 0.34}" stroke="#7fd88f" stroke-width="${s}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function maskable(size) {
  const s = size * 0.3;
  return `
  <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${size}" height="${size}" fill="#0f1110"/>
    <rect x="${size * 0.3}" y="${size * 0.3}" width="${size * 0.4}" height="${size * 0.4}" rx="${size * 0.05}" fill="none" stroke="#7fd88f" stroke-width="${s * 0.45}"/>
    <path d="M ${size * 0.38} ${size * 0.52} L ${size * 0.46} ${size * 0.6} L ${size * 0.62} ${size * 0.44}" stroke="#7fd88f" stroke-width="${s * 0.45}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

for (const size of [192, 512]) {
  await sharp(Buffer.from(svg(size))).png().toFile(`public/icons/icon-${size}.png`);
}
await sharp(Buffer.from(maskable(512))).png().toFile('public/icons/maskable-512.png');
console.log('ícones gerados');
```

Adicione no `package.json`: `"icons": "node scripts/generate-icons.mjs"`.

Run: `npm run icons` → confira os PNGs em `public/icons/`.

- [ ] **Step 2: Manifest**

`src/app/manifest.ts`:

```ts
import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Gestor Pessoal',
    short_name: 'Gestor',
    description: 'Sua secretária pessoal — tarefas, recorrência e lembretes',
    start_url: '/',
    display: 'standalone',
    background_color: '#0f1110',
    theme_color: '#0f1110',
    lang: 'pt-BR',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
```

- [ ] **Step 3: Prompt de instalação**

`src/components/InstallPrompt.tsx`:

```tsx
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
```

Monte `InstallPrompt` ao lado do `NotificationGate` no `(app)/layout.tsx`.

- [ ] **Step 4: Testar instalação**

Run: `npm run dev` → Chrome → três pontinhos → instalar app → abre standalone com tema `#0F1110` e ícone `[✓]`.

- [ ] **Step 5: Commit**

```bash
git add src/app/manifest.ts scripts/generate-icons.mjs public/icons src/components/InstallPrompt.tsx src/app/\(app\)/layout.tsx package.json && git commit -m "feat: pwa instalável (manifest + ícones + prompt)"
```
