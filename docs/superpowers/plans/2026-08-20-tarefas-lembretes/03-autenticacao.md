# Task 3: Autenticação — Auth.js com Google

**Files:**
- Create: `src/lib/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/app/entrar/page.tsx`
- Create: `src/middleware.ts`
- Modify: `src/app/layout.tsx` (SessionProvider global)

**Interfaces:**
- Produces: `auth` (NextAuth), `getAuthUserId(): Promise<string | null>` — usado por TODAS as rotas de API

- [ ] **Step 1: Configurar credenciais no Google Cloud**

Peça ao usuário: no Google Cloud Console, criar credencial OAuth 2.0 (Web application) com redirect `http://localhost:3000/api/auth/callback/google`; preencher `AUTH_GOOGLE_ID` e `AUTH_GOOGLE_SECRET` no `.env`, e `AUTH_SECRET` com o output de `npx auth secret`.

- [ ] **Step 2: Escrever `src/lib/auth.ts`**

```ts
import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { prisma } from '@/lib/db';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google],
  session: { strategy: 'jwt' },
  pages: { signIn: '/entrar' },
  callbacks: {
    jwt({ token, user }) {
      if (user) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) session.user.id = token.sub;
      return session;
    },
  },
});

export async function getAuthUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
```

- [ ] **Step 3: Handler e middleware**

`src/app/api/auth/[...nextauth]/route.ts`:

```ts
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
```

`src/middleware.ts`:

```ts
import { auth } from '@/lib/auth';

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthed = !!req.auth;
  const isAuthPage = nextUrl.pathname === '/entrar';

  if (!isAuthed && !isAuthPage) {
    return Response.redirect(new URL('/entrar', nextUrl));
  }
  if (isAuthed && isAuthPage) {
    return Response.redirect(new URL('/', nextUrl));
  }
});

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|icons|manifest.webmanifest|sw.js|favicon.ico).*)'],
};
```

- [ ] **Step 4: Página de login**

`src/app/entrar/page.tsx`:

```tsx
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
```

- [ ] **Step 5: SessionProvider global**

`src/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { SessionProvider } from 'next-auth/react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Gestor Pessoal',
  description: 'Sua secretária pessoal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 6: Teste manual**

Run: `npm run dev` → acesse `/` → deve redirecionar para `/entrar` → clique em entrar com Google → volte autenticado. (Login real depende da credencial criada no Step 1.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/auth.ts src/middleware.ts src/app/api/auth src/app/entrar src/app/layout.tsx && git commit -m "feat: auth com google (auth.js v5)"
```
