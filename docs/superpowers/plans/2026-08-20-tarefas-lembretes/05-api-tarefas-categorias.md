# Task 5: API — criar/listar tarefas e categorias (CRUD base) + subtarefas

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
  - `GET /api/tasks?hoje=1|0&categoria=<id>&prioridade=<alta|media|baixa>&busca=<texto>&status=<pendente|concluida|todas>` → array de **ocorrências** embutidas, com subtarefas e `ordem`:
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
      ordem: number;
      subtasks: { id: string; title: string; done: boolean; ordem: number }[];
      category: { id: string; name: string; color: string } | null;
    }
    ```
  - `POST /api/tasks` body `{ title, notes?, priority?, categoryId?, dueAt, rule?, subtasks?, reminder? }` → `201 { task, occurrence }` (lembrete agendado na Task 12)
  - `GET/POST /api/categories` → `{ id, name, color }[]` / `201`
  - `PATCH/DELETE /api/categories/:id`

- [ ] **Step 1: Esquemas zod**

`src/lib/validation.ts`:

```ts
import { z } from 'zod';

export const PRIORITIES = ['alta', 'media', 'baixa'] as const;

export const subtaskSchema = z.object({
  title: z.string().trim().min(1, 'título da subtarefa é obrigatório').max(200),
  done: z.boolean().default(false),
  ordem: z.number().int().min(0).default(0),
});

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
      daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
      endDate: z.string().datetime({ offset: true }).nullable().optional(),
    })
    .nullable()
    .optional(),
  subtasks: z.array(subtaskSchema).max(50).optional(),
  ordem: z.number().int().min(0).optional(),
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

- [ ] **Step 2: Rota de tarefas (GET inclui subtarefas e ordem)**

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
        include: {
          category: { select: { id: true, name: true, color: true } },
          subtasks: { orderBy: { ordem: 'asc' } },
        },
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
    ordem: o.task.ordem,
    subtasks: o.task.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done, ordem: s.ordem })),
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
  const { title, notes, priority, categoryId, dueAt, rule, subtasks, ordem } = parsed.data;

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
      ordem: ordem ?? 0,
      subtasks: subtasks?.length
        ? {
            create: subtasks.map((s, i) => ({ title: s.title, done: s.done, ordem: s.ordem ?? i })),
          }
        : undefined,
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

- [ ] **Step 4: Teste de API (criar + listar, com subtarefa)**

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
  it('cria tarefa com ocorrência e subtarefas', async () => {
    const req = new Request('http://localhost/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Pagar aluguel',
        dueAt: '2026-08-13T15:00:00.000Z',
        subtasks: [
          { title: 'conferir valor', done: false },
          { title: 'enviar comprovante', done: false },
        ],
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.occurrence.dueAt).toBe('2026-08-13T15:00:00.000Z');
    expect(body.task.priority).toBe('media');
    const created = await prisma.task.findUnique({ where: { id: body.task.id }, include: { subtasks: true } });
    expect(created?.subtasks).toHaveLength(2);
    expect(created?.subtasks[0].title).toBe('conferir valor');
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
git add src/lib/validation.ts src/app/api/tasks src/app/api/categories tests/api && git commit -m "feat: api de tarefas e categorias (crud base com subtarefas)"
```
