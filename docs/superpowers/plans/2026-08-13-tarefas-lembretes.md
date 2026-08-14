# Módulo 1 — Tarefas + Lembretes: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar um PWA "secretária pessoal" onde o usuário cria tarefas com vencimento, recorrência e lembretes, e recebe push notification no celular na hora exata — sincronizado entre aparelhos via conta Google.

**Architecture:** Next.js 15 (App Router) full-stack na Vercel; Prisma + Postgres (Neon); Auth.js v5 com Google; lembretes agendados via QStash (cron one-shot) que chamam uma API route, que envia Web Push (VAPID) via `web-push`. Recorrência é materializada: a regra vive na `Task`; as listas mostram `TaskOccurrence` concretas.

**Tech Stack:** Next.js 15 · TypeScript · Prisma · PostgreSQL (Neon) · Auth.js v5 (next-auth@beta) · zod · @upstash/qstash · web-push · Vitest · Playwright · sharp (dev, para ícones)

## Global Constraints

(do spec `docs/superpowers/specs/2026-08-13-tarefas-lembretes-design.md` — vale para todas as tarefas)

- Interface estilo **Terminal**: base `#0F1110`, texto `#E6E4DC`, secundário `#6E736B`, acento único verde CRT `#7FD88F`, prioridade alta âmbar `#E5A050`
- Monospace em toda a UI (Consolas/Menlo/SF Mono, fallback `monospace`); labels maiúsculas com espaçamento largo; sem cards, sem sombras, sem gradientes, cantos retos
- Copy da interface em **PT-BR**
- Toda entrada de API validada com **zod**; `400` validação, `401` sem sessão, `404` recurso inexistente ou de outro usuário
- Toda query de dados filtra por `userId` (isolamento multiusuário)
- Datas sempre armazenadas como **instantes UTC** (colunas `DateTime`); exibição em horário local
- UI otimista com rollback; status de sync no topo: `sincronizado` / `sincronizando…` / `offline`
- Prioridades: `alta | media | baixa`; status de ocorrência: `pendente | concluida | ignorada`; status de lembrete: `pendente | enviado | falhou`
- Nenhuma dependência além das listadas no Tech Stack (sem framework de UI)

---

### Task 1: Fundação — scaffold Next.js + Vitest + git

**Files:**
- Create: projeto inteiro (create-next-app)
- Create: `vitest.config.ts`, `tests/hello.test.ts`
- Create: `.env.example`
- Modify: `package.json` (scripts)

**Interfaces:**
- Produces: projeto compilável com `npm run dev` e `npm test`; alias `@/*` → `src/*` (create-next-app já configura para TS)

- [ ] **Step 1: Scaffold**

```bash
npx create-next-app@latest . --ts --eslint --app --src-dir --no-tailwind --import-alias "@/*" --use-npm --yes
```

Se algum flag for rejeitado pela versão do create-next-app, rode sem ele e responda `n` para Tailwind quando perguntado. Depois remova o CSS padrão:

```bash
# src/app/page.tsx e src/app/globals.css serão substituídos nas Tasks 7+
git add -A && git commit -m "chore: scaffold next.js com typescript"
```

- [ ] **Step 2: Instalar dependências**

```bash
npm i prisma @prisma/client next-auth@beta @auth/prisma-adapter zod @upstash/qstash web-push
npm i -D vitest @vitest/coverage-v8 @types/web-push sharp cross-env @playwright/test
```

- [ ] **Step 3: Configurar Vitest**

Crie `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

Crie `tests/setup.ts` (troca o banco para o de teste antes de qualquer import de `prisma`):

```ts
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
```

Crie `tests/hello.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

describe('suíte de testes', () => {
  it('roda', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Adicione no `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Rodar e verificar**

Run: `npm test`
Expected: `tests/hello.test.ts` PASS (1 teste).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: vitest configurado com alias @"
```

---

### Task 2: Banco — Prisma schema + Neon + migração

**Files:**
- Create: `prisma/schema.prisma`
- Create: `src/lib/db.ts`
- Create: `.env` (a partir de `.env.example`, com a URL real do usuário)

**Interfaces:**
- Consumes: nada
- Produces: `prisma` (singleton) — usado por todas as rotas; modelos `User`, `Category`, `Task`, `TaskOccurrence`, `Reminder`, `PushSubscription`

- [ ] **Step 1: Escrever o schema**

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  googleId  String   @unique
  name      String
  email     String   @unique
  avatarUrl String?
  createdAt DateTime @default(now())

  tasks       Task[]
  categories  Category[]
  occurrences TaskOccurrence[]
  reminders   Reminder[]
  pushSubs    PushSubscription[]
}

model Category {
  id     String @id @default(cuid())
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  name   String
  color  String @default("#7FD88F")

  tasks Task[]

  @@unique([userId, name])
  @@index([userId])
}

model Task {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title      String
  notes      String?
  priority   String   @default("media") // alta | media | baixa
  categoryId String?
  category   Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  rule           Json?    // { frequency: 'daily'|'weekly'|'monthly'|'yearly', interval: number, endDate?: string }
  reminderPreset String?  // preset do lembrete da tarefa: 'agora'|'30min'|'1h'|'1dia'|'custom'
  createdAt      DateTime @default(now())
  updatedAt  DateTime @updatedAt

  occurrences TaskOccurrence[]
  reminders   Reminder[]

  @@index([userId])
}

model TaskOccurrence {
  id          String    @id @default(cuid())
  taskId      String
  task        Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  dueAt       DateTime
  status      String    @default("pendente") // pendente | concluida | ignorada
  completedAt DateTime?

  reminders Reminder[]

  @@unique([taskId, dueAt])
  @@index([taskId, status])
  @@index([dueAt])
}

model Reminder {
  id               String    @id @default(cuid())
  taskId           String
  task             Task      @relation(fields: [taskId], references: [id], onDelete: Cascade)
  occurrenceId     String?
  occurrence       TaskOccurrence? @relation(fields: [occurrenceId], references: [id], onDelete: Cascade)
  remindAt         DateTime
  status           String    @default("pendente") // pendente | enviado | falhou
  sentAt           DateTime?
  qstashScheduleId String?
  createdAt        DateTime  @default(now())

  @@index([status, remindAt])
}

model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())

  @@index([userId])
}
```

- [ ] **Step 2: Pedir ao usuário a URL do Neon**

Pergunte ao usuário: "Crie um projeto Neon (neon.tech, plano grátis) e me passe a connection string do Postgres (DATABASE_URL)." Enquanto isso, crie `.env.example`:

```bash
# Banco (Neon — neon.tech)
DATABASE_URL=postgresql://user:senha@host/gerenciador?sslmode=require
# Banco de testes (pode ser outro banco no mesmo cluster Neon)
TEST_DATABASE_URL=

# Auth.js v5 (gerar com: npx auth secret)
AUTH_SECRET=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# QStash (Upstash — upstash.com)
QSTASH_TOKEN=

# Web Push VAPID (gerar com: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:seu@email.com
```

- [ ] **Step 3: Cliente singleton**

Crie `src/lib/db.ts`:

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
```

- [ ] **Step 4: Migrar dev e teste**

```bash
cp .env.example .env   # cole a URL real do Neon em DATABASE_URL
npx prisma migrate dev --name init
npx prisma db push     # com DATABASE_URL=TEST_DATABASE_URL setado no .env
```

Expected: migração aplicada; `npx prisma generate` roda automaticamente.

- [ ] **Step 5: Commit**

```bash
git add prisma src/lib/db.ts .env.example && git commit -m "feat: schema prisma (user, categoria, tarefa, ocorrencia, lembrete, push)"
```

⚠️ `.env` já está no `.gitignore` — nunca commitar.

---

### Task 3: Autenticação — Auth.js com Google

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

---

### Task 4: Motor de recorrência (TDD)

**Files:**
- Create: `src/lib/recurrence.ts`
- Test: `tests/recurrence.test.ts`

**Interfaces:**
- Produces:
  - `type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'`
  - `interface RecurrenceRule { frequency: Frequency; interval: number; endDate: string | null }`
  - `parseRule(input: unknown): { ok: true; rule: RecurrenceRule } | { ok: false; error: string }`
  - `nextOccurrence(rule: RecurrenceRule, after: Date): Date | null` — primeira data estritamente depois de `after` que respeita a regra e não ultrapassa `endDate`

- [ ] **Step 1: Escrever os testes que falham**

`tests/recurrence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextOccurrence, parseRule } from '@/lib/recurrence';

const rule = (f: 'daily' | 'weekly' | 'monthly' | 'yearly', interval = 1, endDate: string | null = null) => ({ frequency: f, interval, endDate });

describe('parseRule', () => {
  it('aceita regra válida', () => {
    expect(parseRule({ frequency: 'weekly', interval: 2 }).ok).toBe(true);
  });
  it('rejeita frequência desconhecida', () => {
    expect(parseRule({ frequency: 'mensal' }).ok).toBe(false);
  });
  it('rejeita intervalo zero ou negativo', () => {
    expect(parseRule({ frequency: 'daily', interval: 0 }).ok).toBe(false);
    expect(parseRule({ frequency: 'daily', interval: -2 }).ok).toBe(false);
  });
  it('rejeita endDate inválido', () => {
    expect(parseRule({ frequency: 'daily', endDate: 'nao-e-data' }).ok).toBe(false);
  });
});

describe('nextOccurrence', () => {
  const after = new Date('2026-08-13T10:00:00Z');

  it('diária: próximo dia', () => {
    expect(nextOccurrence(rule('daily'), after)?.toISOString()).toBe('2026-08-14T10:00:00.000Z');
  });

  it('semanal: +7 dias', () => {
    expect(nextOccurrence(rule('weekly'), after)?.toISOString()).toBe('2026-08-20T10:00:00.000Z');
  });

  it('semanal com intervalo 2: +14 dias', () => {
    expect(nextOccurrence(rule('weekly', 2), after)?.toISOString()).toBe('2026-08-27T10:00:00.000Z');
  });

  it('mensal: preserva dia 13', () => {
    expect(nextOccurrence(rule('monthly'), after)?.toISOString()).toBe('2026-09-13T10:00:00.000Z');
  });

  it('mensal: dia 31 de janeiro clampado para fevereiro', () => {
    const jan31 = new Date('2026-01-31T08:00:00Z');
    expect(nextOccurrence(rule('monthly'), jan31)?.toISOString()).toBe('2026-02-28T08:00:00.000Z');
  });

  it('anual: mesmo dia e hora no ano seguinte', () => {
    expect(nextOccurrence(rule('yearly'), after)?.toISOString()).toBe('2027-08-13T10:00:00.000Z');
  });

  it('anual com 29/fev: clamp para 28/fev em ano não bissexto', () => {
    const feb29 = new Date('2024-02-29T08:00:00Z');
    expect(nextOccurrence(rule('yearly'), feb29)?.toISOString()).toBe('2025-02-28T08:00:00.000Z');
  });

  it('retorna null quando a próxima ocorrência passa do endDate', () => {
    const ruleWithEnd = { frequency: 'daily' as const, interval: 1, endDate: '2026-08-14T10:00:00.000Z' };
    expect(nextOccurrence(ruleWithEnd, new Date('2026-08-14T10:00:00.000Z'))).toBeNull();
  });

  it('null quando endDate já passou', () => {
    const ruleWithEnd = { frequency: 'daily' as const, interval: 1, endDate: '2026-08-01T00:00:00.000Z' };
    expect(nextOccurrence(ruleWithEnd, after)).toBeNull();
  });

  it('nunca retorna a própria data (estritamente depois)', () => {
    expect(nextOccurrence(rule('daily'), after)!.getTime()).toBeGreaterThan(after.getTime());
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/recurrence.test.ts`
Expected: FAIL (módulo `@/lib/recurrence` não existe).

- [ ] **Step 3: Implementar**

`src/lib/recurrence.ts`:

```ts
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  frequency: Frequency;
  interval: number;
  endDate: string | null;
}

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly'];

export function parseRule(input: unknown): { ok: true; rule: RecurrenceRule } | { ok: false; error: string } {
  if (input === null || typeof input !== 'object') return { ok: false, error: 'regra inválida' };
  const r = input as Record<string, unknown>;

  if (typeof r.frequency !== 'string' || !FREQUENCIES.includes(r.frequency as Frequency)) {
    return { ok: false, error: 'frequência inválida' };
  }
  const interval = r.interval === undefined ? 1 : r.interval;
  if (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 1) {
    return { ok: false, error: 'intervalo deve ser inteiro >= 1' };
  }
  let endDate: string | null = null;
  if (r.endDate !== undefined && r.endDate !== null) {
    if (typeof r.endDate !== 'string' || Number.isNaN(new Date(r.endDate).getTime())) {
      return { ok: false, error: 'data de fim inválida' };
    }
    endDate = r.endDate;
  }
  return { ok: true, rule: { frequency: r.frequency as Frequency, interval, endDate } };
}

function addInterval(d: Date, frequency: Frequency, n: number): Date {
  const r = new Date(d);
  if (frequency === 'daily') r.setUTCDate(r.getUTCDate() + n);
  if (frequency === 'weekly') r.setUTCDate(r.getUTCDate() + 7 * n);
  if (frequency === 'monthly' || frequency === 'yearly') {
    const months = frequency === 'monthly' ? n : 12 * n;
    const day = r.getUTCDate();
    r.setUTCDate(1);
    r.setUTCMonth(r.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
    r.setUTCDate(Math.min(day, lastDay));
  }
  return r;
}

export function nextOccurrence(rule: RecurrenceRule, after: Date): Date | null {
  if (rule.endDate && new Date(rule.endDate).getTime() <= after.getTime()) return null;

  let candidate = addInterval(after, rule.frequency, rule.interval);
  for (let i = 0; i < 1200; i++) {
    if (rule.endDate && candidate.getTime() > new Date(rule.endDate).getTime()) return null;
    if (candidate.getTime() > after.getTime()) return candidate;
    candidate = addInterval(candidate, rule.frequency, rule.interval);
  }
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/recurrence.test.ts`
Expected: 12 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurrence.ts tests/recurrence.test.ts && git commit -m "feat: motor de recorrência com testes"
```

---

### Task 5: API — criar/listar tarefas e categorias (CRUD base)

**Files:**
- Create: `src/lib/validation.ts`
- Create: `src/app/api/tasks/route.ts` (POST, GET)
- Create: `src/app/api/categories/route.ts` (GET, POST)
- Create: `src/app/api/categories/[id]/route.ts` (PATCH, DELETE)
- Test: `tests/api/tasks.test.ts`

**Interfaces:**
- Consumes: `getAuthUserId` (Task 3), `prisma` (Task 2)
- Produces:
  - `taskCreateSchema`, `taskUpdateSchema`, `categorySchema` (zod) em `src/lib/validation.ts`
  - `GET /api/tasks?hoje=1|0&categoria=<id>&prioridade=<alta|media|baixa>&busca=<texto>&status=<pendente|concluida|todas>` → array de **ocorrências** embutidas:
    ```ts
    interface TaskRow {
      id: string;            // id da OCCORRÊNCIA (é o que as listas mostram)
      taskId: string;
      title: string;
      notes: string | null;
      priority: string;
      dueAt: string;
      status: string;
      completedAt: string | null;
      rule: unknown;
      category: { id: string; name: string; color: string } | null;
    }
    ```
  - `POST /api/tasks` body `{ title, notes?, priority?, categoryId?, dueAt, rule? }` → `201 { task, occurrence }` (lembrete entra na Task 11)
  - `GET/POST /api/categories` → `{ id, name, color }[]` / `201`
  - `PATCH/DELETE /api/categories/:id`

- [ ] **Step 1: Esquemas zod**

`src/lib/validation.ts`:

```ts
import { z } from 'zod';

export const PRIORITIES = ['alta', 'media', 'baixa'] as const;

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, 'título é obrigatório').max(200),
  notes: z.string().max(2000).optional().nullable(),
  priority: z.enum(PRIORITIES).default('media'),
  categoryId: z.string().cuid().optional().nullable(),
  dueAt: z.string().datetime({ offset: true }).refine((v) => !Number.isNaN(new Date(v).getTime()), 'data inválida'),
  rule: z
    .object({
      frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
      interval: z.number().int().min(1).default(1),
      endDate: z.string().datetime({ offset: true }).nullable().optional(),
    })
    .nullable()
    .optional(),
  reminder: z
    .object({
      preset: z.enum(['agora', '30min', '1h', '1dia', 'custom']),
      customAt: z.string().datetime({ offset: true }).optional(),
    })
    .nullable()
    .optional(),
});

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  done: z.boolean().optional(),
  occurrenceId: z.string().cuid().optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'nome é obrigatório').max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor inválida').default('#7FD88F'),
});
```

- [ ] **Step 2: Rota de tarefas**

`src/app/api/tasks/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { taskCreateSchema } from '@/lib/validation';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const params = req.nextUrl.searchParams;
  const hoje = params.get('hoje') === '1';
  const status = params.get('status') ?? 'todas';
  const categoria = params.get('categoria');
  const prioridade = params.get('prioridade');
  const busca = params.get('busca')?.trim();

  const now = new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const occurrences = await prisma.taskOccurrence.findMany({
    where: {
      task: {
        userId,
        ...(categoria ? { categoryId: categoria } : {}),
        ...(prioridade ? { priority: prioridade } : {}),
        ...(busca ? { title: { contains: busca, mode: 'insensitive' } } : {}),
      },
      ...(status === 'pendente' ? { status: 'pendente' } : {}),
      ...(status === 'concluida' ? { status: 'concluida' } : {}),
      ...(hoje
        ? {
            status: 'pendente',
            OR: [
              { dueAt: { lt: startOfToday } },
              { dueAt: { gte: startOfToday, lt: endOfToday } },
            ],
          }
        : {}),
    },
    include: {
      task: {
        include: { category: { select: { id: true, name: true, color: true } } },
      },
    },
    orderBy: { dueAt: 'asc' },
  });

  const rows = occurrences.map((o) => ({
    id: o.id,
    taskId: o.taskId,
    title: o.task.title,
    notes: o.task.notes,
    priority: o.task.priority,
    dueAt: o.dueAt.toISOString(),
    status: o.status,
    completedAt: o.completedAt?.toISOString() ?? null,
    rule: o.task.rule,
    category: o.task.category,
  }));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const parsed = taskCreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { title, notes, priority, categoryId, dueAt, rule } = parsed.data;

  if (categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: categoryId, userId } });
    if (!cat) return NextResponse.json({ error: 'categoria não encontrada' }, { status: 400 });
  }

  const task = await prisma.task.create({
    data: {
      userId,
      title,
      notes,
      priority,
      categoryId,
      rule: (rule as object | null) ?? undefined,
      reminderPreset: parsed.data.reminder?.preset ?? null,
    },
  });
  const occurrence = await prisma.taskOccurrence.create({
    data: { taskId: task.id, dueAt: new Date(dueAt) },
  });

  return NextResponse.json({ task, occurrence }, { status: 201 });
}
```

- [ ] **Step 3: Rotas de categorias**

`src/app/api/categories/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { categorySchema } from '@/lib/validation';

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const categories = await prisma.category.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const parsed = categorySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { name, color } = parsed.data;

  const exists = await prisma.category.findFirst({ where: { userId, name } });
  if (exists) return NextResponse.json({ error: 'categoria já existe' }, { status: 409 });

  const category = await prisma.category.create({ data: { userId, name, color } });
  return NextResponse.json(category, { status: 201 });
}
```

`src/app/api/categories/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { categorySchema } from '@/lib/validation';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.category.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: 'categoria não encontrada' }, { status: 404 });

  const parsed = categorySchema.partial().safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const updated = await prisma.category.update({ where: { id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.category.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: 'categoria não encontrada' }, { status: 404 });

  await prisma.category.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Teste de API (criar + listar)**

`tests/api/tasks.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';

vi.mock('@/lib/auth', () => ({
  getAuthUserId: vi.fn(),
}));

import { getAuthUserId } from '@/lib/auth';
import { POST } from '@/app/api/tasks/route';

const mockUserId = 'user-teste';

beforeEach(async () => {
  vi.mocked(getAuthUserId).mockResolvedValue(mockUserId);
  await prisma.task.deleteMany({ where: { userId: mockUserId } });
  await prisma.category.deleteMany({ where: { userId: mockUserId } });
});

afterEach(async () => {
  await prisma.task.deleteMany({ where: { userId: mockUserId } });
  await prisma.category.deleteMany({ where: { userId: mockUserId } });
});

describe('POST /api/tasks', () => {
  it('cria tarefa com ocorrência', async () => {
    const req = new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'Pagar aluguel', dueAt: '2026-08-13T15:00:00.000Z' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.occurrence.dueAt).toBe('2026-08-13T15:00:00.000Z');
    expect(body.task.priority).toBe('media');
  });

  it('rejeita sem título', async () => {
    const req = new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ dueAt: '2026-08-13T15:00:00.000Z' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(400);
  });

  it('rejeita sem sessão', async () => {
    vi.mocked(getAuthUserId).mockResolvedValueOnce(null);
    const req = new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title: 'x', dueAt: '2026-08-13T15:00:00.000Z' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 5: Preparar banco de teste e rodar**

```bash
# Certifique-se de que TEST_DATABASE_URL existe no .env e foi criado no Neon
npx prisma db push --skip-generate  # aplica schema no banco de teste
npx vitest run tests/api/tasks.test.ts
```

Expected: 3 testes PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/validation.ts src/app/api/tasks src/app/api/categories tests/api && git commit -m "feat: api de tarefas e categorias (crud base)"
```

---

### Task 6: API — editar, excluir, concluir com recorrência

**Files:**
- Create: `src/app/api/tasks/[id]/route.ts` (PATCH, DELETE)
- Test: `tests/api/tasks-complete.test.ts`

**Interfaces:**
- Consumes: `nextOccurrence`, `parseRule` (Task 4), `taskUpdateSchema` (Task 5)
- Produces: `PATCH /api/tasks/:id` body `{ done?: boolean, occurrenceId?, ...camposEditaveis }` →
  - `done: true` com `occurrenceId` → marca a ocorrência concluída; se a tarefa tem `rule`, cria a próxima ocorrência e devolve `{ occurrence, next: TaskRow | null }`
  - sem `done` → atualiza a tarefa (campos parciais)
  - `DELETE /api/tasks/:id` → `{ ok: true }` (cascata remove ocorrências; lembretes/QStash entram na Task 11)

- [ ] **Step 1: Testes que falham**

`tests/api/tasks-complete.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';

vi.mock('@/lib/auth', () => ({ getAuthUserId: vi.fn() }));
import { getAuthUserId } from '@/lib/auth';
import { PATCH } from '@/app/api/tasks/[id]/route';
import { POST } from '@/app/api/tasks/route';

const mockUserId = 'user-complete';

beforeEach(async () => {
  vi.mocked(getAuthUserId).mockResolvedValue(mockUserId);
  await prisma.task.deleteMany({ where: { userId: mockUserId } });
});

afterEach(async () => {
  await prisma.task.deleteMany({ where: { userId: mockUserId } });
});

async function createTask(body: object) {
  const req = new Request('http://localhost/api/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  const res = await POST(req as never);
  return (await res.json()) as { task: { id: string }; occurrence: { id: string; dueAt: string } };
}

describe('PATCH /api/tasks/:id — concluir', () => {
  it('conclui ocorrência e gera a próxima (recorrência diária)', async () => {
    const { task, occurrence } = await createTask({
      title: 'Beber água',
      dueAt: '2026-08-13T10:00:00.000Z',
      rule: { frequency: 'daily' },
    });

    const req = new Request(`http://localhost/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: true, occurrenceId: occurrence.id }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: task.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.occurrence.status).toBe('concluida');
    expect(body.occurrence.completedAt).not.toBeNull();
    expect(body.next).not.toBeNull();
    expect(body.next.dueAt).toBe('2026-08-14T10:00:00.000Z');
  });

  it('não gera próxima quando não há regra', async () => {
    const { task, occurrence } = await createTask({ title: 'Única', dueAt: '2026-08-13T10:00:00.000Z' });

    const req = new Request(`http://localhost/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: true, occurrenceId: occurrence.id }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: task.id }) });
    const body = await res.json();
    expect(body.next).toBeNull();
  });

  it('não gera próxima quando a regra terminou', async () => {
    const { task, occurrence } = await createTask({
      title: 'Com fim',
      dueAt: '2026-08-13T10:00:00.000Z',
      rule: { frequency: 'daily', endDate: '2026-08-13T10:00:00.000Z' },
    });

    const req = new Request(`http://localhost/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: true, occurrenceId: occurrence.id }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: task.id }) });
    const body = await res.json();
    expect(body.next).toBeNull();
  });

  it('404 para tarefa de outro usuário', async () => {
    const req = new Request('http://localhost/api/tasks/inexistente', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'x' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: 'inexistente' }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/api/tasks-complete.test.ts`
Expected: FAIL (rota não existe).

- [ ] **Step 3: Implementar**

`src/app/api/tasks/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { taskUpdateSchema } from '@/lib/validation';
import { nextOccurrence, parseRule } from '@/lib/recurrence';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) return NextResponse.json({ error: 'tarefa não encontrada' }, { status: 404 });

  const parsed = taskUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { done, occurrenceId, ...fields } = parsed.data;

  if (done === true) {
    if (!occurrenceId) return NextResponse.json({ error: 'occurrenceId é obrigatório para concluir' }, { status: 400 });

    const occurrence = await prisma.taskOccurrence.findFirst({
      where: { id: occurrenceId, taskId: task.id },
    });
    if (!occurrence) return NextResponse.json({ error: 'ocorrência não encontrada' }, { status: 404 });

    const updated = await prisma.taskOccurrence.update({
      where: { id: occurrence.id },
      data: { status: 'concluida', completedAt: new Date() },
    });

    let next = null;
    if (task.rule) {
      const parsedRule = parseRule(task.rule);
      if (parsedRule.ok) {
        const nextDueAt = nextOccurrence(parsedRule.rule, updated.dueAt);
        if (nextDueAt) {
          const nextOcc = await prisma.taskOccurrence.create({
            data: { taskId: task.id, dueAt: nextDueAt },
          });
          next = {
            id: nextOcc.id,
            taskId: nextOcc.taskId,
            title: task.title,
            notes: task.notes,
            priority: task.priority,
            dueAt: nextOcc.dueAt.toISOString(),
            status: nextOcc.status,
            completedAt: null,
            rule: task.rule,
            category: null,
          };
        }
      }
    }

    return NextResponse.json({
      occurrence: {
        id: updated.id,
        status: updated.status,
        completedAt: updated.completedAt?.toISOString() ?? null,
      },
      next,
    });
  }

  if (Object.keys(fields).length === 0) return NextResponse.json({ error: 'nenhum campo para atualizar' }, { status: 400 });

  if (fields.categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: fields.categoryId, userId } });
    if (!cat) return NextResponse.json({ error: 'categoria não encontrada' }, { status: 400 });
  }

  const updatedTask = await prisma.task.update({
    where: { id: task.id },
    data: {
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
      ...(fields.priority !== undefined ? { priority: fields.priority } : {}),
      ...(fields.categoryId !== undefined ? { categoryId: fields.categoryId } : {}),
      ...(fields.rule !== undefined ? { rule: fields.rule as object | null } : {}),
    },
  });

  return NextResponse.json({ task: updatedTask });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) return NextResponse.json({ error: 'tarefa não encontrada' }, { status: 404 });

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/api/tasks-complete.test.ts`
Expected: 4 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tasks/[id]/route.ts tests/api/tasks-complete.test.ts && git commit -m "feat: editar, excluir e concluir tarefa com recorrência"
```

---

### Task 7: Shell da interface — estilo Terminal, tela Hoje

**Files:**
- Create: `src/app/globals.css` (vars + base do tema)
- Create: `src/app/(app)/layout.tsx` (AppShell com status de sync)
- Create: `src/app/(app)/page.tsx` (tela Hoje)
- Create: `src/components/TaskRow.tsx`
- Create: `src/components/SyncStatus.tsx`
- Create: `src/lib/api.ts` (client helpers)
- Create: `src/hooks/useTasks.ts`

**Interfaces:**
- Consumes: `GET /api/tasks` (Task 5)
- Produces: `TaskRow` (props `row: TaskRowData`, `onToggle`) — reusado pelas telas Lista e Concluídas; `useTasks(filters)` → `{ rows, loading, refresh }`; `apiGet/apiPost/apiPatch/apiDelete` em `src/lib/api.ts`

- [ ] **Step 1: Tema global**

`src/app/globals.css`:

```css
:root {
  --bg: #0f1110;
  --fg: #e6e4dc;
  --dim: #6e736b;
  --accent: #7fd88f;
  --alert: #e5a050;
  --line: #262a26;
  --panel: #141714;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: Consolas, Menlo, 'SF Mono', monospace;
  font-size: 14px;
  -webkit-tap-highlight-color: transparent;
}

button { font-family: inherit; }
input, textarea, select { font-family: inherit; color: var(--fg); background: var(--panel); border: 1px solid var(--line); padding: 10px 12px; font-size: 13px; width: 100%; }
input:focus, textarea:focus, select:focus { outline: 1px solid var(--accent); }
::placeholder { color: var(--dim); }

.app { max-width: 640px; margin: 0 auto; min-height: 100dvh; display: flex; flex-direction: column; }
.content { flex: 1; padding: 0 18px 96px; }

.nav { display: flex; gap: 18px; padding: 14px 18px; border-bottom: 1px dashed var(--line); position: sticky; top: 0; background: var(--bg); z-index: 10; }
.nav a { color: var(--dim); text-decoration: none; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; }
.nav a.active { color: var(--accent); }
.nav a.active::before { content: '> '; }

.date-head { font-size: 30px; margin: 18px 0 2px; }
.date-head b { color: var(--accent); }
.sub { font-size: 11px; color: var(--dim); margin-bottom: 8px; }

.sec { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); margin: 16px 0 4px; }
.sec.muted { color: var(--dim); }

.fab { position: fixed; bottom: 20px; right: max(18px, calc(50vw - 320px + 18px)); width: 52px; height: 52px; border-radius: 50%; background: var(--accent); color: var(--bg); border: none; font-size: 26px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.5); z-index: 20; }

.empty { color: var(--dim); font-size: 12px; padding: 24px 0; }
.error { color: var(--alert); font-size: 11px; padding: 8px 0; }
```

- [ ] **Step 2: Helpers de API + hook**

`src/lib/api.ts`:

```ts
export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiSend<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
}

export const apiPost = <T>(url: string, body: unknown) => apiSend<T>('POST', url, body);
export const apiPatch = <T>(url: string, body: unknown) => apiSend<T>('PATCH', url, body);
export const apiDelete = <T>(url: string, body?: unknown) => apiSend<T>('DELETE', url, body);
```

`src/hooks/useTasks.ts`:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

export interface TaskRowData {
  id: string;
  taskId: string;
  title: string;
  notes: string | null;
  priority: string;
  dueAt: string;
  status: string;
  completedAt: string | null;
  rule: unknown;
  category: { id: string; name: string; color: string } | null;
}

export function useTasks(params: string = '') {
  const [rows, setRows] = useState<TaskRowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await apiGet<TaskRowData[]>(`/api/tasks${params}`);
      setRows(data);
    } catch {
      setError('falha ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { rows, setRows, loading, error, refresh };
}
```

- [ ] **Step 3: SyncStatus + AppShell**

`src/components/SyncStatus.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

export default function SyncStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
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
```

`src/app/(app)/layout.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SyncStatus from '@/components/SyncStatus';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { href: '/', label: 'hoje' },
    { href: '/lista', label: 'lista' },
    { href: '/concluidas', label: 'concluídas' },
  ];

  return (
    <div className="app">
      <nav className="nav">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={pathname === t.href ? 'active' : ''}>
            {t.label}
          </Link>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <SyncStatus />
        </span>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: TaskRow**

`src/components/TaskRow.tsx`:

```tsx
'use client';

import { apiPatch } from '@/lib/api';
import type { TaskRowData } from '@/hooks/useTasks';

export default function TaskRow({
  row,
  onToggle,
}: {
  row: TaskRowData;
  onToggle: (row: TaskRowData) => void;
}) {
  const meta = [
    row.dueAt ? new Date(row.dueAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
    row.priority === 'alta' ? '!alta' : '',
    row.category?.name ?? '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="task" data-done={row.status === 'concluida'}>
      <button
        className="cb"
        onClick={() => onToggle(row)}
        aria-label={row.status === 'concluida' ? 'desfazer conclusão' : 'concluir'}
      >
        {row.status === 'concluida' ? '[x]' : '[ ]'}
      </button>
      <div style={{ flex: 1 }}>
        <div className="tt" style={row.status === 'concluida' ? { color: 'var(--dim)', textDecoration: 'line-through' } : undefined}>
          {row.title}
        </div>
        {row.notes ? <div className="meta">{row.notes}</div> : null}
        {meta ? <div className="meta">{meta}</div> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Tela Hoje**

`src/app/(app)/page.tsx`:

```tsx
'use client';

import { useCallback, useState } from 'react';
import TaskRow from '@/components/TaskRow';
import { useTasks, type TaskRowData } from '@/hooks/useTasks';
import { apiPatch } from '@/lib/api';

function groupToday(rows: TaskRowData[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdue = rows.filter((r) => r.status === 'pendente' && new Date(r.dueAt) < startOfToday);
  const today = rows.filter((r) => {
    const d = new Date(r.dueAt);
    return r.status === 'pendente' && d >= startOfToday && d < new Date(startOfToday.getTime() + 86400000);
  });
  const sort = (a: TaskRowData, b: TaskRowData) => {
    const p = { alta: 0, media: 1, baixa: 2 } as const;
    return p[a.priority as keyof typeof p] - p[b.priority as keyof typeof p] || +new Date(a.dueAt) - +new Date(b.dueAt);
  };
  return { overdue: overdue.sort(sort), today: today.sort(sort) };
}

export default function Hoje() {
  const { rows, setRows, loading, error, refresh } = useTasks('?status=pendente');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const onToggle = useCallback(
    async (row: TaskRowData) => {
      const prev = rows;
      // otimista: marca na hora, desfaz se a API falhar
      setRows((rs) =>
        rs.map((r) => (r.id === row.id ? { ...r, status: 'concluida', completedAt: new Date().toISOString() } : r))
      );
      setPendingId(row.id);
      try {
        const res = await apiPatch<{ next: { dueAt: string } | null }>(`/api/tasks/${row.taskId}`, {
          done: true,
          occurrenceId: row.id,
        });
        if (res.next) {
          const d = new Date(res.next.dueAt);
          console.log(`próxima: ${d.toLocaleDateString('pt-BR')}`);
        }
        refresh();
      } catch (e) {
        setRows(prev); // rollback otimista
        console.error(e);
      } finally {
        setPendingId(null);
      }
    },
    [rows, refresh]
  );

  const { overdue, today } = groupToday(rows);

  return (
    <>
      <div className="date-head">
        {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} <b>▮</b>
      </div>
      <div className="sub">
        {new Date().toLocaleDateString('pt-BR', { weekday: 'long' })} · {today.length + overdue.length} pendentes
      </div>

      {overdue.length > 0 && (
        <>
          <div className="sec">&gt; atrasadas ({overdue.length})</div>
          {overdue.map((r) => (
            <TaskRow key={r.id} row={r} onToggle={onToggle} />
          ))}
        </>
      )}

      <div className="sec">&gt; hoje ({today.length})</div>
      {today.map((r) => (
        <TaskRow key={r.id} row={r} onToggle={onToggle} />
      ))}

      {loading && <div className="empty">carregando…</div>}
      {!loading && today.length === 0 && overdue.length === 0 && (
        <div className="empty">nada para hoje. [ + ] para criar.</div>
      )}
      {error && <div className="error">[erro] {error}</div>}
      {pendingId && <div className="empty">sincronizando…</div>}
    </>
  );
}
```

- [ ] **Step 6: Rodar e testar manualmente**

Run: `npm run dev` → autenticado → tela Hoje renderiza tarefas (crie 1 pela API antes: `POST /api/tasks` via `! curl` ou pela próxima task). Estilo: fundo `#0F1110`, acentos verdes, checkbox `[ ]`.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/app/\(app\) src/components/TaskRow.tsx src/components/SyncStatus.tsx src/lib/api.ts src/hooks && git commit -m "feat: shell terminal + tela hoje"
```

---

### Task 8: Telas Lista e Concluídas

**Files:**
- Create: `src/app/(app)/lista/page.tsx`
- Create: `src/app/(app)/concluidas/page.tsx`

**Interfaces:**
- Consumes: `TaskRow`, `useTasks`, `apiPatch` (Task 7)

- [ ] **Step 1: Tela Lista (busca + chips + agrupada por data)**

`src/app/(app)/lista/page.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import TaskRow from '@/components/TaskRow';
import { useTasks, type TaskRowData } from '@/hooks/useTasks';
import { apiPatch } from '@/lib/api';
import { apiGet } from '@/lib/api';
import { useEffect } from 'react';

export default function Lista() {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [prioridade, setPrioridade] = useState<string | null>(null);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);

  const qs = [
    'status=pendente',
    categoria ? `categoria=${categoria}` : '',
    prioridade ? `prioridade=${prioridade}` : '',
    busca ? `busca=${encodeURIComponent(busca)}` : '',
  ]
    .filter(Boolean)
    .join('&');

  const { rows, refresh } = useTasks(`?${qs}`);

  useEffect(() => {
    apiGet<{ id: string; name: string }[]>('/api/categories').then(setCats).catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, TaskRowData[]>();
    for (const r of rows) {
      const day = new Date(r.dueAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'long' });
      const arr = map.get(day) ?? [];
      arr.push(r);
      map.set(day, arr);
    }
    return [...map.entries()];
  }, [rows]);

  const onToggle = async (row: TaskRowData) => {
    try {
      await apiPatch(`/api/tasks/${row.taskId}`, { done: true, occurrenceId: row.id });
      refresh();
    } catch (e) {
      console.error(e);
    }
  };

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
        color: active ? 'var(--accent)' : 'var(--dim)',
        background: 'transparent',
        padding: '5px 10px',
        fontSize: 10,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="date-head">
        lista <b>▮</b>
      </div>
      <input placeholder="> buscar: _" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ marginTop: 10 }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {chip('todas', categoria === null && prioridade === null, () => { setCategoria(null); setPrioridade(null); })}
        {cats.map((c) => chip(`[${c.name}]`, categoria === c.id, () => setCategoria(categoria === c.id ? null : c.id)))}
        {chip('!alta', prioridade === 'alta', () => setPrioridade(prioridade === 'alta' ? null : 'alta'))}
      </div>

      {grouped.map(([day, dayRows]) => (
        <div key={day}>
          <div className="sec muted">{day} ({dayRows.length})</div>
          {dayRows.map((r) => (
            <TaskRow key={r.id} row={r} onToggle={onToggle} />
          ))}
        </div>
      ))}
      {!rows.length && <div className="empty">nenhuma tarefa pendente.</div>}
    </>
  );
}
```

- [ ] **Step 2: Tela Concluídas**

`src/app/(app)/concluidas/page.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import TaskRow from '@/components/TaskRow';
import { useTasks, type TaskRowData } from '@/hooks/useTasks';
import { apiPatch } from '@/lib/api';

export default function Concluidas() {
  const { rows, refresh } = useTasks('?status=concluida');

  const byDay = useMemo(() => {
    const map = new Map<string, TaskRowData[]>();
    for (const r of rows) {
      const key = r.completedAt
        ? new Date(r.completedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'long' })
        : 'outros';
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [rows]);

  const onUndo = async (row: TaskRowData) => {
    try {
      await apiPatch(`/api/tasks/${row.taskId}`, { done: false, occurrenceId: row.id });
      refresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <div className="date-head">
        concluídas <b>▮</b>
      </div>
      {byDay.map(([day, dayRows]) => (
        <div key={day}>
          <div className="sec muted">{day} ({dayRows.length})</div>
          {dayRows.map((r) => (
            <TaskRow key={r.id} row={r} onToggle={onUndo} />
          ))}
        </div>
      ))}
      {!rows.length && <div className="empty">nada concluído ainda.</div>}
    </>
  );
}
```

- [ ] **Step 3: Desfazer conclusão no backend**

`PATCH /api/tasks/:id` com `{ done: false, occurrenceId }` não está implementado — estenda a rota (Task 6) antes do `if (done === true)`:

```ts
  if (done === false) {
    if (!occurrenceId) return NextResponse.json({ error: 'occurrenceId é obrigatório' }, { status: 400 });
    const occurrence = await prisma.taskOccurrence.findFirst({ where: { id: occurrenceId, taskId: task.id } });
    if (!occurrence) return NextResponse.json({ error: 'ocorrência não encontrada' }, { status: 404 });
    const updated = await prisma.taskOccurrence.update({
      where: { id: occurrence.id },
      data: { status: 'pendente', completedAt: null },
    });
    return NextResponse.json({ occurrence: { id: updated.id, status: updated.status, completedAt: null } });
  }
```

- [ ] **Step 4: Teste manual**

Run: `npm run dev` → navegue pelas 3 abas; conclua uma tarefa na Hoje e veja ela aparecer em Concluídas; desfaça e veja voltar.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/lista src/app/\(app\)/concluidas src/app/api/tasks && git commit -m "feat: telas lista e concluídas + desfazer conclusão"
```

---

### Task 9: Modal de nova tarefa (bottom sheet)

**Files:**
- Create: `src/components/TaskForm.tsx`
- Create: `src/components/Fab.tsx`
- Modify: `src/app/(app)/layout.tsx` (adicionar Fab e TaskForm)

**Interfaces:**
- Consumes: `apiPost` (Task 7), `apiGet` para categorias
- Produces: `TaskForm({ open, onClose, onCreated })` — sheet com campos título, notas, prioridade `[alta|média|baixa]`, categoria, data/hora, recorrência (frequência + intervalo + fim), lembrete (preset — armazenado mas ainda sem agendamento, Task 11); `Fab()` — botão `+` verde que abre o sheet

- [ ] **Step 1: Escrever o componente**

`src/components/TaskForm.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';

interface Category { id: string; name: string; color: string }

export default function TaskForm({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [cats, setCats] = useState<Category[]>([]);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'alta' | 'media' | 'baixa'>('media');
  const [categoryId, setCategoryId] = useState('');
  const [dueAt, setDueAt] = useState<string>('');
  const [freq, setFreq] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | ''>('');
  const [interval_, setInterval_] = useState(1);
  const [endDate, setEndDate] = useState('');
  const [reminder, setReminder] = useState('30min');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    setDueAt(d.toISOString().slice(0, 16));
    apiGet<Category[]>('/api/categories').then(setCats).catch(() => {});
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title,
        notes: notes || null,
        priority,
        dueAt: new Date(dueAt).toISOString(),
        ...(categoryId ? { categoryId } : {}),
        ...(freq ? { rule: { frequency: freq, interval: interval_, ...(endDate ? { endDate: new Date(endDate).toISOString() } : {}) } } : {}),
        reminder: { preset: reminder },
      };
      await apiPost('/api/tasks', body);
      onCreated();
      onClose();
    } catch (e) {
      setError('não foi possível salvar');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: 'var(--dim)', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(5,6,5,.82)',
        display: 'flex',
        alignItems: 'flex-end',
        zIndex: 100,
        backdropFilter: 'none',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 640,
          margin: '0 auto',
          background: 'var(--bg)',
          border: '1px solid var(--line)',
          borderBottom: 'none',
          padding: '18px 18px 26px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 12 }}>
          <span>&gt; nova tarefa</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', padding: 0, width: 'auto' }}>esc</button>
        </div>

        {field('título', <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="_" />)}
        {field('notas', <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opcional" />)}

        <div style={{ display: 'flex', gap: 10 }}>
          {field('data/hora', <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />)}
          {field('prioridade', (
            <select value={priority} onChange={(e) => setPriority(e.target.value as 'alta' | 'media' | 'baixa')}>
              <option value="alta">!alta</option>
              <option value="media">média</option>
              <option value="baixa">baixa</option>
            </select>
          ))}
        </div>

        {field('categoria', (
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— nenhuma —</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ))}

        <div style={{ display: 'flex', gap: 10 }}>
          {field('recorrência', (
            <select value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)}>
              <option value="">nenhuma</option>
              <option value="daily">diária</option>
              <option value="weekly">semanal</option>
              <option value="monthly">mensal</option>
              <option value="yearly">anual</option>
            </select>
          ))}
          {freq && field('intervalo', (
            <input type="number" min={1} value={interval_} onChange={(e) => setInterval_(Math.max(1, +e.target.value))} />
          ))}
          {freq && field('fim (opcional)', <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />)}
        </div>

        {field('lembrete', (
          <select value={reminder} onChange={(e) => setReminder(e.target.value)}>
            <option value="30min">30min antes</option>
            <option value="1h">1h antes</option>
            <option value="1dia">1 dia antes</option>
            <option value="agora">na hora</option>
          </select>
        ))}

        {error && <div className="error">[erro] {error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid var(--line)', color: 'var(--fg)', padding: 11, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
            [cancelar]
          </button>
          <button onClick={submit} disabled={saving || !title.trim()} style={{ flex: 1, background: 'var(--accent)', border: 'none', color: 'var(--bg)', padding: 11, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 'bold', cursor: 'pointer' }}>
            {saving ? 'salvando…' : '[salvar]'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Fab e integração no layout**

`src/components/Fab.tsx`:

```tsx
'use client';

export default function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button className="fab" onClick={onClick} aria-label="nova tarefa">
      +
    </button>
  );
}
```

Modifique `src/app/(app)/layout.tsx`: adicione `'use client'` + estado + render:

```tsx
  const [formOpen, setFormOpen] = useState(false);
  ...
  <main className="content">{children}</main>
  <Fab onClick={() => setFormOpen(true)} />
  <TaskForm open={formOpen} onClose={() => setFormOpen(false)} onCreated={() => window.location.reload()} />
```

(imports: `useState` de react, `TaskForm`, `Fab`; `onCreated` recarrega a página — simples e suficiente para v1.)

- [ ] **Step 3: Rodar e testar**

Run: `npm run dev` → `+` abre o sheet → cria tarefa com recorrência → aparece na Hoje; `npm test` continua verde.

- [ ] **Step 4: Commit**

```bash
git add src/components/TaskForm.tsx src/components/Fab.tsx src/app/\(app\)/layout.tsx && git commit -m "feat: modal de nova tarefa (bottom sheet)"
```

---

### Task 10: Push — VAPID, subscribe do aparelho, service worker

**Files:**
- Create: `src/app/api/push/subscribe/route.ts`
- Create: `src/app/api/push/subscribe/route.ts` DELETE
- Create: `src/components/NotificationGate.tsx`
- Create: `public/sw.js`
- Create: `src/lib/push.ts`
- Modify: `src/app/(app)/layout.tsx` (montar `NotificationGate`)

**Interfaces:**
- Consumes: `getAuthUserId`, `prisma`
- Produces:
  - `src/lib/push.ts`: `ensureVapid()` (configura web-push uma vez), `sendPushToUser(userId, payload: { title, body, id })`
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
const SHELL = ['/', '/lista', '/concluidas', '/manifest.webmanifest', '/entrar'];

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
  if (url.origin === location.origin && (url.pathname === '/' || url.pathname === '/lista' || url.pathname === '/concluidas')) {
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

---

### Task 11: Lembretes — agendamento QStash + trigger de push

**Files:**
- Create: `src/lib/reminders.ts`
- Create: `src/app/api/reminders/trigger/route.ts`
- Create: `src/lib/reminder-rule.ts`
- Modify: `src/lib/validation.ts` (schema aceita `reminder`)
- Modify: `src/app/api/tasks/route.ts` (POST agenda lembrete)
- Modify: `src/app/api/tasks/[id]/route.ts` (PATCH re-agenda; DELETE cancela; conclusão agenda o próximo)
- Test: `tests/reminder-rule.test.ts`, `tests/reminders.test.ts` (com QStash mockado)

**Interfaces:**
- Consumes: `nextOccurrence` (Task 4), `sendPushToUser` (Task 10)
- Produces:
  - `src/lib/reminder-rule.ts`: `computeRemindAt(dueAt: Date, preset: 'agora'|'30min'|'1h'|'1dia'|'custom', customAt?: string): Date`
  - `src/lib/reminders.ts`:
    - `scheduleReminder(reminderId: string, remindAt: Date): Promise<{ qstashScheduleId: string }>`
    - `cancelScheduledReminder(qstashScheduleId: string): Promise<void>`
    - `createReminderForOccurrence(taskId: string, occurrenceId: string, dueAt: Date, preset: string, customAt?: string): Promise<void>`
  - `POST /api/reminders/trigger` (assinatura QStash + push + marca `enviado`/`falhou`)

- [ ] **Step 1: Regras de lembrete (TDD)**

`tests/reminder-rule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeRemindAt } from '@/lib/reminder-rule';

const due = new Date('2026-08-13T15:00:00.000Z');

describe('computeRemindAt', () => {
  it('agora = mesma hora', () => {
    expect(computeRemindAt(due, 'agora').toISOString()).toBe('2026-08-13T15:00:00.000Z');
  });
  it('30min antes', () => {
    expect(computeRemindAt(due, '30min').toISOString()).toBe('2026-08-13T14:30:00.000Z');
  });
  it('1h antes', () => {
    expect(computeRemindAt(due, '1h').toISOString()).toBe('2026-08-13T14:00:00.000Z');
  });
  it('1 dia antes', () => {
    expect(computeRemindAt(due, '1dia').toISOString()).toBe('2026-08-12T15:00:00.000Z');
  });
  it('custom usa a data informada', () => {
    expect(computeRemindAt(due, 'custom', '2026-08-13T08:00:00.000Z').toISOString()).toBe('2026-08-13T08:00:00.000Z');
  });
  it('custom inválida lança erro', () => {
    expect(() => computeRemindAt(due, 'custom', 'invalida')).toThrow();
  });
});
```

`src/lib/reminder-rule.ts`:

```ts
export const REMINDER_PRESETS = ['agora', '30min', '1h', '1dia', 'custom'] as const;
export type ReminderPreset = (typeof REMINDER_PRESETS)[number];

export function computeRemindAt(dueAt: Date, preset: ReminderPreset, customAt?: string): Date {
  switch (preset) {
    case 'agora':
      return new Date(dueAt.getTime());
    case '30min':
      return new Date(dueAt.getTime() - 30 * 60 * 1000);
    case '1h':
      return new Date(dueAt.getTime() - 60 * 60 * 1000);
    case '1dia':
      return new Date(dueAt.getTime() - 24 * 60 * 60 * 1000);
    case 'custom': {
      const d = customAt ? new Date(customAt) : new Date(NaN);
      if (Number.isNaN(d.getTime())) throw new Error('data de lembrete inválida');
      return d;
    }
  }
}
```

- [ ] **Step 2: Lib de agendamento (QStash mockado)**

`src/lib/reminders.ts`:

```ts
import { Client } from '@upstash/qstash';
import { prisma } from '@/lib/db';

function qstash(): Client {
  return new Client({ token: process.env.QSTASH_TOKEN ?? 'mock-token' });
}

function oneShotCron(at: Date): string {
  return `${at.getUTCMinutes()} ${at.getUTCHours()} ${at.getUTCDate()} ${at.getUTCMonth() + 1} *`;
}

export async function scheduleReminder(reminderId: string, remindAt: Date): Promise<{ qstashScheduleId: string }> {
  const client = qstash();
  const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const res = await client.schedules.create({
    destination: `${baseUrl}/api/reminders/trigger`,
    cron: oneShotCron(remindAt),
    body: JSON.stringify({ reminderId }),
    retries: 5,
  });
  return { qstashScheduleId: res.scheduleId };
}

export async function cancelScheduledReminder(qstashScheduleId: string): Promise<void> {
  const client = qstash();
  await client.schedules.delete(qstashScheduleId);
}

export async function createReminderForOccurrence(opts: {
  taskId: string;
  occurrenceId: string;
  dueAt: Date;
  preset: string;
  customAt?: string;
}): Promise<void> {
  const { computeRemindAt } = await import('@/lib/reminder-rule');
  const remindAt = computeRemindAt(opts.dueAt, opts.preset as never, opts.customAt);
  if (remindAt.getTime() <= Date.now()) return; // lembrete no passado: não agenda

  const reminder = await prisma.reminder.create({
    data: {
      taskId: opts.taskId,
      occurrenceId: opts.occurrenceId,
      remindAt,
    },
  });
  try {
    const { qstashScheduleId } = await scheduleReminder(reminder.id, remindAt);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { qstashScheduleId } });
  } catch (e) {
    console.error('falha ao agendar lembrete', e);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { status: 'falhou' } });
  }
}
```

- [ ] **Step 3: Validar `reminder` no schema**

Já feito na Task 5 (campo `reminder` em `taskCreateSchema`, herdado pelo `taskUpdateSchema` via `.partial()`). Confira que o campo existe em `src/lib/validation.ts`; se não, adicione:

```ts
  reminder: z
    .object({
      preset: z.enum(['agora', '30min', '1h', '1dia', 'custom']),
      customAt: z.string().datetime({ offset: true }).optional(),
    })
    .nullable()
    .optional(),
```

> O preset da tarefa é persistido na coluna `reminderPreset` da `Task` (no POST e na edição); o lembrete concreto de cada ocorrência fica na tabela `Reminder`.

- [ ] **Step 4: Integrar no POST /api/tasks**

Em `src/app/api/tasks/route.ts` (POST), após criar a `occurrence`:

```ts
  if (parsed.data.reminder?.preset) {
    const { createReminderForOccurrence } = await import('@/lib/reminders');
    await createReminderForOccurrence({
      taskId: task.id,
      occurrenceId: occurrence.id,
      dueAt: new Date(dueAt),
      preset: parsed.data.reminder.preset,
      customAt: parsed.data.reminder.customAt,
    });
  }
```

- [ ] **Step 5: Integrar no PATCH/DELETE**

Em `src/app/api/tasks/[id]/route.ts`:

1. **DELETE** — antes de excluir, cancele agendamentos:

```ts
  const reminders = await prisma.reminder.findMany({
    where: { taskId: task.id, qstashScheduleId: { not: null } },
  });
  const { cancelScheduledReminder } = await import('@/lib/reminders');
  await Promise.allSettled(
    reminders.map((r) => (r.qstashScheduleId ? cancelScheduledReminder(r.qstashScheduleId) : Promise.resolve()))
  );
```

2. **Concluir (`done: true`)** — o preset da tarefa (`task.reminderPreset`, salvo no POST/edição) vale para a próxima ocorrência. No bloco `if (nextDueAt)`, a criação de `nextOcc` passa a agendar o lembrete da próxima. Substitua o bloco de Task 6:

```ts
        if (nextDueAt) {
          const nextOcc = await prisma.taskOccurrence.create({
            data: { taskId: task.id, dueAt: nextDueAt },
          });
          if (task.reminderPreset) {
            const { createReminderForOccurrence } = await import('@/lib/reminders');
            await createReminderForOccurrence({
              taskId: task.id,
              occurrenceId: nextOcc.id,
              dueAt: nextDueAt,
              preset: task.reminderPreset,
            });
          }
          next = {
            id: nextOcc.id,
            taskId: nextOcc.taskId,
            title: task.title,
            notes: task.notes,
            priority: task.priority,
            dueAt: nextOcc.dueAt.toISOString(),
            status: nextOcc.status,
            completedAt: null,
            rule: task.rule,
            category: null,
          };
        }
```

3. **Editar (sem `done`)** — se `reminder` veio no body, salva o preset na tarefa e cria o lembrete da próxima ocorrência pendente. No bloco de `prisma.task.update`, inclua o campo novo e depois o agendamento:

```ts
  const updatedTask = await prisma.task.update({
    where: { id: task.id },
    data: {
      ...(fields.title !== undefined ? { title: fields.title } : {}),
      ...(fields.notes !== undefined ? { notes: fields.notes } : {}),
      ...(fields.priority !== undefined ? { priority: fields.priority } : {}),
      ...(fields.categoryId !== undefined ? { categoryId: fields.categoryId } : {}),
      ...(fields.rule !== undefined ? { rule: fields.rule as object | null } : {}),
      ...(fields.reminder?.preset ? { reminderPreset: fields.reminder.preset } : {}),
    },
  });

  if (fields.reminder?.preset) {
    const { createReminderForOccurrence } = await import('@/lib/reminders');
    const activeOcc = await prisma.taskOccurrence.findFirst({
      where: { taskId: task.id, status: 'pendente' },
      orderBy: { dueAt: 'asc' },
    });
    if (activeOcc) {
      await createReminderForOccurrence({
        taskId: task.id,
        occurrenceId: activeOcc.id,
        dueAt: activeOcc.dueAt,
        preset: fields.reminder.preset,
        customAt: fields.reminder.customAt,
      });
    }
  }
```

- [ ] **Step 6: Rota trigger com verificação QStash**

`src/app/api/reminders/trigger/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';
import { prisma } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');
  if (!signature) return NextResponse.json({ error: 'sem assinatura' }, { status: 401 });

  const client = new Client({ token: process.env.QSTASH_TOKEN ?? '' });
  const valid = await client.verify({ signature, body: rawBody });
  if (!valid) return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 });

  let payload: { reminderId?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'corpo inválido' }, { status: 400 });
  }
  if (!payload.reminderId) return NextResponse.json({ error: 'reminderId ausente' }, { status: 400 });

  const reminder = await prisma.reminder.findUnique({ where: { id: payload.reminderId } });
  if (!reminder) return NextResponse.json({ ok: true }); // já cancelado: sucesso silencioso

  if (reminder.status !== 'pendente') return NextResponse.json({ ok: true });

  const task = await prisma.task.findUnique({ where: { id: reminder.taskId } });
  if (!task) return NextResponse.json({ ok: true });

  const result = await sendPushToUser(task.userId, {
    title: task.title,
    body: `vence ${new Date(reminder.remindAt).toLocaleString('pt-BR')}`,
    id: reminder.id,
  });

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: { status: result.sent > 0 ? 'enviado' : 'falhou', sentAt: new Date() },
  });

  return NextResponse.json({ ok: true, sent: result.sent });
}
```

- [ ] **Step 7: Testes de unidade (QStash mockado)**

`tests/reminders.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';

vi.mock('@upstash/qstash', () => {
  const schedules = {
    create: vi.fn().mockResolvedValue({ scheduleId: 'sch-1' }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return {
    Client: vi.fn().mockImplementation(() => ({
      schedules,
      verify: vi.fn().mockResolvedValue(true),
    })),
  };
});

import { createReminderForOccurrence } from '@/lib/reminders';
import { POST as trigger } from '@/app/api/reminders/trigger/route';

const userId = 'user-reminder';

beforeEach(async () => {
  await prisma.task.deleteMany({ where: { userId } });
});

afterEach(async () => {
  await prisma.task.deleteMany({ where: { userId } });
});

describe('createReminderForOccurrence', () => {
  it('cria lembrete pendente com schedule id', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Com lembrete' } });
    const occ = await prisma.taskOccurrence.create({
      data: { taskId: task.id, dueAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    await createReminderForOccurrence({
      taskId: task.id,
      occurrenceId: occ.id,
      dueAt: occ.dueAt,
      preset: '30min',
    });

    const reminder = await prisma.reminder.findFirst({ where: { taskId: task.id } });
    expect(reminder).not.toBeNull();
    expect(reminder!.qstashScheduleId).toBe('sch-1');
  });

  it('não agenda lembrete no passado', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Atrasado' } });
    const occ = await prisma.taskOccurrence.create({
      data: { taskId: task.id, dueAt: new Date(Date.now() - 1000) },
    });

    await createReminderForOccurrence({
      taskId: task.id,
      occurrenceId: occ.id,
      dueAt: occ.dueAt,
      preset: '30min',
    });

    const count = await prisma.reminder.count({ where: { taskId: task.id } });
    expect(count).toBe(0);
  });
});

describe('trigger', () => {
  it('rejeita sem assinatura', async () => {
    const req = new Request('http://localhost/api/reminders/trigger', {
      method: 'POST',
      body: JSON.stringify({ reminderId: 'x' }),
    });
    const res = await trigger(req as never);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 8: Rodar testes**

Run: `npx vitest run tests/reminder-rule.test.ts tests/reminders.test.ts`
Expected: 7 testes PASS (6 + 1). Ajuste o mock de `scheduleReminder` se o SDK do QStash exigir `qstash().schedules` — os nomes seguem a doc atual; se a assinatura real do SDK diferir, adapte **apenas o SDK call**, mantendo as interfaces `scheduleReminder`/`cancelScheduledReminder` estáveis.

- [ ] **Step 9: Commit**

```bash
git add src/lib/reminders.ts src/lib/reminder-rule.ts src/app/api/reminders tests/reminder-rule.test.ts tests/reminders.test.ts src/lib/validation.ts src/app/api/tasks && git commit -m "feat: lembretes com qstash + trigger de push"
```

---

### Task 12: PWA — manifest, ícones, instalação

**Files:**
- Create: `src/app/manifest.ts`
- Create: `scripts/generate-icons.mjs`
- Create: `public/icons/` (gerado pelo script)
- Modify: `package.json` (script `icons`)

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

Run: `node scripts/generate-icons.mjs` → confira os PNGs em `public/icons/`.

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

- [ ] **Step 3: Prompt de instalação (antes-instalado)**

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

---

### Task 13: E2E Playwright + README + deploy Vercel

**Files:**
- Create: `playwright.config.ts`
- Create: `tests/e2e/fluxo.spec.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: app completo rodando (Tasks 1–12)
- Produces: verificação de ponta a ponta no viewport mobile + instruções de deploy

- [ ] **Step 1: Config Playwright**

`playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  use: {
    baseURL: 'http://localhost:3100',
    viewport: { width: 390, height: 844 },
    isMobile: true,
  },
  webServer: {
    command: 'npx cross-env PORT=3100 npm run dev',
    url: 'http://localhost:3100',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'secret-e2e-nao-usar-em-prod',
    },
  },
});
```

> O `webServer` roda contra o banco de **teste** (`TEST_DATABASE_URL`) e com `AUTH_SECRET` fixa — o cookie do teste é assinado com essa mesma chave (Step 2).

- [ ] **Step 2: Teste do fluxo principal**

`tests/e2e/fluxo.spec.ts`:

```ts
import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

const AUTH_SECRET = process.env.AUTH_SECRET ?? 'secret-e2e-nao-usar-em-prod';

// JWT HS256 no formato que o Auth.js v5 aceita (cookie authjs.session-token).
// Interceptar /api/auth/session não basta: o middleware lê o cookie no servidor.
function fakeSessionToken(): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const header = enc({ alg: 'HS256', typ: 'JWT' });
  const now = Math.floor(Date.now() / 1000);
  const payload = enc({
    sub: 'e2e-user',
    name: 'E2E',
    email: 'e2e@teste.dev',
    iat: now,
    exp: now + 86_400,
  });
  const data = `${header}.${payload}`;
  const sig = createHmac('sha256', AUTH_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

test('cria tarefa, conclui e some da lista de pendentes', async ({ context, page }) => {
  await context.addCookies([
    { name: 'authjs.session-token', value: fakeSessionToken(), url: 'http://localhost:3100' },
  ]);

  await page.goto('/');
  await expect(page.getByText(/hoje/).first()).toBeVisible();

  await page.getByLabel('nova tarefa').click();
  await page.getByPlaceholder('_').fill('E2E - pagar conta');

  // vencimento: daqui a 1h (mesmo dia local, cai em "hoje")
  const d = new Date(Date.now() + 3_600_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  await page
    .locator('input[type="datetime-local"]')
    .fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);

  await page.getByRole('button', { name: '[salvar]' }).click();

  await expect(page.getByText('E2E - pagar conta')).toBeVisible();

  await page.getByRole('button', { name: 'concluir' }).last().click();
  await expect(page.getByText('E2E - pagar conta').first()).not.toBeVisible();
});
```

> Limite conhecido: se o teste rodar entre 23:00 e 00:00 local, "daqui a 1h" cai no dia seguinte e a tela Hoje não mostra a tarefa — re-execute nesse caso.

- [ ] **Step 3: Rodar E2E**

```bash
npx playwright install chromium
npm run build   # garante build ok
npx playwright test
```

Expected: 1 teste PASS (cria → conclui → some da Hoje). Se falhar por timing, aumente `expect.timeout` para 15s no config. Se a API de `datetime-local`/placeholders variar, ajuste os seletores mantendo o fluxo.

- [ ] **Step 4: README**

`README.md`:

```markdown
# Gestor Pessoal

Secretária pessoal PWA: tarefas com recorrência e lembretes por push.

## Stack
Next.js 15 · TypeScript · Prisma · Postgres (Neon) · Auth.js (Google) · QStash · Web Push

## Rodando local
1. `cp .env.example .env` e preencha (Neon, Google OAuth, QStash, VAPID)
2. `npm i && npx prisma migrate dev && npm run dev`
3. Acesse http://localhost:3000

## Deploy (Vercel)
1. Crie o projeto na Vercel e conecte o repo (framework: Next.js)
2. Adicione as variáveis de ambiente (mesmas do `.env`)
3. No Google Cloud, adicione o callback `https://<app>.vercel.app/api/auth/callback/google`
4. Deploy. Push notifications exigem HTTPS — a Vercel já entrega.

## Testes
`npm test` (unitários/API) · `npx playwright test` (E2E)
```

- [ ] **Step 5: Deploy na Vercel**

Peça ao usuário: `npx vercel` (ou painel da Vercel) → importar repo → preencher env vars → `vercel --prod`. Depois: ajustar o callback do Google OAuth para a URL de produção e definir `APP_URL` no ambiente.

- [ ] **Step 6: Commit**

```bash
git add playwright.config.ts tests/e2e README.md && git commit -m "test: e2e do fluxo principal + docs de deploy"
```

---

## Self-Review (feito na escrita)

- **Cobertura do spec:** arquitetura (T1–T3), modelo 6 tabelas (T2), API completa (T5–T6), recorrência (T4), fluxo de lembrete QStash→trigger→push (T10–T11), estilo Terminal (T7–T9), PWA offline/instalação (T10–T12), erros/zod/otimismo (T5–T9), testes unit/API/E2E (T4–T6, T11, T13), deploy/env (T13, `.env.example` na T2).
- **Fora do escopo consciente:** criação offline com fila IndexedDB (anotado no spec como melhoria futura); lembrete custom por ocorrência (v1 usa preset da tarefa); módulos 2–4.
- **Consistência de tipos:** `TaskRow` (T5) = `TaskRowData` (T7); `getAuthUserId` (T3) usado em todas as rotas; `nextOccurrence/parseRule` (T4) usados em T6 e T11; `computeRemindAt` (T11) definido antes do uso; `sendPushToUser` (T10) consumida em T11; `apiDelete(url, body?)` (T7) compatível com o uso no `NotificationGate` (T10); `TaskOccurrence` não tem `createdAt` — orderBy só por `dueAt` (T5); E2E usa cookie JWT assinado com a mesma `AUTH_SECRET` do `webServer` (T13).
- **Ajustes pós-revisão:** (1) otimismo com rollback na conclusão da tela Hoje (spec §9 — T7, via `setRows` exposto pelo hook); (2) coluna `reminderPreset` na `Task` guarda o preset do formulário e a conclusão clona para a próxima ocorrência (T2/T5/T11); (3) campo `reminder` aceito no zod desde a T5 (evita strip silencioso no POST da T9); (4) login E2E via cookie JWT HS256 com `node:crypto` — interceptar `/api/auth/session` não engana o middleware.
