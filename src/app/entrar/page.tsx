'use client';

import { signIn } from 'next-auth/react';

export default function Entrar() {
  return (
    <main style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center', justifyContent: 'center', minHeight: '100dvh', fontFamily: 'monospace' }}>
      <p style={{ color: 'var(--accent)', fontSize: '32px' }}>[✓]</p>
      <h1 style={{ color: 'var(--fg)', fontSize: '18px', letterSpacing: '.12em', textTransform: 'uppercase' }}>gestor pessoal</h1>
      <button
        onClick={() => signIn('google', { callbackUrl: '/' })}
        style={{ background: 'var(--accent)', color: 'var(--bg)', border: 'none', padding: '12px 22px', fontSize: '12px', letterSpacing: '.12em', textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 'bold', cursor: 'pointer' }}
      >
        [entrar com google]
      </button>
    </main>
  );
}
