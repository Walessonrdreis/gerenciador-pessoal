# Task 7: Modelos de tarefas — CRUD + apply (cópia)

**Files:**
- Create: `src/app/api/templates/route.ts` (GET, POST)
- Create: `src/app/api/templates/[id]/route.ts` (PATCH, DELETE)
- Create: `src/app/api/templates/[id]/apply/route.ts` (POST)
- Create: `src/lib/template.ts` (lógica de cópia)
- Test: `tests/api/templates.test.ts`

**Interfaces:**
- Consumes: `getAuthUserId` (Task 3), `prisma` (Task 2)
- Produces:
  - `GET /api/templates` → `{ id, name, subtasks, priority, categoryId, reminderPreset }[]` (do usuário)
  - `POST /api/templates` body `{ name, subtasks?, priority?, categoryId?, reminderPreset? }` → `201` modelo criado
  - `PATCH /api/templates/:id` → modelo atualizado; `DELETE /api/templates/:id` → `{ ok: true }`
  - `POST /api/templates/:id/apply` body `{ title, dueAt, categoryId?, priority?, subtasks?, reminder? }` → `201 { task, occurrence }` — **cria cópia** (Task + Subtasks + lembrete pendente; agendamento na Task 12)

- [ ] **Step 1: Testes que falham**

`tests/api/templates.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';

vi.mock('@/lib/auth', () => ({ getAuthUserId: vi.fn() }));
import { getAuthUserId } from '@/lib/auth';
import { POST as createTemplate } from '@/app/api/templates/route';
import { POST as applyTemplate } from '@/app/api/templates/[id]/apply/route';

const mockUserId = 'user-template';

beforeEach(async () => {
  vi.mocked(getAuthUserId).mockResolvedValue(mockUserId);
  await prisma.task.deleteMany({ where: { userId: mockUserId } });
  await prisma.taskTemplate.deleteMany({ where: { userId: mockUserId } });
});

afterEach(async () => {
  await prisma.task.deleteMany({ where: { userId: mockUserId } });
  await prisma.taskTemplate.deleteMany({ where: { userId: mockUserId } });
});

describe('POST /api/templates', () => {
  it('cria modelo com subtarefas padrão', async () => {
    const req = new Request('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Reunião de trabalho',
        subtasks: [{ titulo: 'preparar pauta', ordem: 0 }, { titulo: 'enviar convite', ordem: 1 }],
        priority: 'alta',
      }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await createTemplate(req as never);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe('Reunião de trabalho');
    expect(body.subtasks).toHaveLength(2);
  });

  it('rejeita sem nome', async () => {
    const req = new Request('http://localhost/api/templates', {
      method: 'POST',
      body: JSON.stringify({ subtasks: [] }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await createTemplate(req as never);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/templates/:id/apply', () => {
  it('cria tarefa cópia com subtarefas a partir do modelo', async () => {
    const template = await prisma.taskTemplate.create({
      data: {
        userId: mockUserId,
        name: 'Reunião',
        subtasks: [{ titulo: 'preparar pauta', ordem: 0 }],
        priority: 'alta',
      },
    });

    const req = new Request(`http://localhost/api/templates/${template.id}/apply`, {
      method: 'POST',
      body: JSON.stringify({ title: 'Reunião com cliente', dueAt: '2026-08-13T15:00:00.000Z' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await applyTemplate(req as never, { params: Promise.resolve({ id: template.id }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.task.title).toBe('Reunião com cliente');
    expect(body.task.priority).toBe('alta');

    const task = await prisma.task.findUniqueOrThrow({ where: { id: body.task.id }, include: { subtasks: true } });
    expect(task.subtasks).toHaveLength(1);
    expect(task.subtasks[0].title).toBe('preparar pauta');
  });

  it('404 para modelo de outro usuário', async () => {
    const req = new Request('http://localhost/api/templates/inexistente/apply', {
      method: 'POST',
      body: JSON.stringify({ title: 'x', dueAt: '2026-08-13T15:00:00.000Z' }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await applyTemplate(req as never, { params: Promise.resolve({ id: 'inexistente' }) });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/api/templates.test.ts`
Expected: FAIL (rotas não existem).

- [ ] **Step 3: Esquemas e rotas CRUD**

Adicione em `src/lib/validation.ts`:

```ts
export const templateSchema = z.object({
  name: z.string().trim().min(1, 'nome é obrigatório').max(80),
  subtasks: z
    .array(
      z.object({
        titulo: z.string().trim().min(1).max(200),
        ordem: z.number().int().min(0),
      })
    )
    .max(50)
    .optional(),
  priority: z.enum(PRIORITIES).default('media'),
  categoryId: z.string().cuid().optional().nullable(),
  reminderPreset: z.enum(['agora', '30min', '1h', '1dia', 'custom']).optional().nullable(),
});
```

`src/app/api/templates/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { templateSchema } from '@/lib/validation';

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const templates = await prisma.taskTemplate.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const parsed = templateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { name, subtasks, priority, categoryId, reminderPreset } = parsed.data;

  const template = await prisma.taskTemplate.create({
    data: {
      userId,
      name,
      subtasks: (subtasks as object | undefined) ?? undefined,
      priority,
      categoryId,
      reminderPreset,
    },
  });
  return NextResponse.json(template, { status: 201 });
}
```

`src/app/api/templates/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { templateSchema } from '@/lib/validation';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.taskTemplate.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: 'modelo não encontrado' }, { status: 404 });

  const parsed = templateSchema.partial().safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const updated = await prisma.taskTemplate.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.subtasks !== undefined ? { subtasks: parsed.data.subtasks as object } : {}),
      ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
      ...(parsed.data.categoryId !== undefined ? { categoryId: parsed.data.categoryId } : {}),
      ...(parsed.data.reminderPreset !== undefined ? { reminderPreset: parsed.data.reminderPreset } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.taskTemplate.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: 'modelo não encontrado' }, { status: 404 });

  await prisma.taskTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Lógica de cópia + apply**

`src/lib/template.ts`:

```ts
import { prisma } from '@/lib/db';

export async function applyTemplateToTask(opts: {
  templateId: string;
  userId: string;
  title: string;
  dueAt: string;
  categoryId?: string | null;
  priority?: string;
  subtasks?: { title: string; done?: boolean; ordem?: number }[];
  reminderPreset?: string | null;
}) {
  const template = await prisma.taskTemplate.findFirst({ where: { id: opts.templateId, userId: opts.userId } });
  if (!template) return { ok: false as const, error: 'modelo não encontrado', status: 404 };

  const templateSubtasks = (template.subtasks as { titulo: string; ordem: number }[] | null) ?? [];

  const task = await prisma.task.create({
    data: {
      userId: opts.userId,
      title: opts.title,
      priority: opts.priority ?? template.priority,
      categoryId: opts.categoryId ?? template.categoryId,
      reminderPreset: opts.reminderPreset ?? template.reminderPreset ?? null,
      rule: null,
      ordem: 0,
      subtasks: {
        create: [
          ...templateSubtasks.map((s, i) => ({ title: s.titulo, done: false, ordem: s.ordem ?? i })),
          ...(opts.subtasks ?? []).map((s, i) => ({ title: s.title, done: s.done ?? false, ordem: s.ordem ?? i + templateSubtasks.length })),
        ],
      },
    },
  });
  const occurrence = await prisma.taskOccurrence.create({
    data: { taskId: task.id, dueAt: new Date(opts.dueAt) },
  });

  return { ok: true as const, task, occurrence };
}
```

`src/app/api/templates/[id]/apply/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { applyTemplateToTask } from '@/lib/template';
import { z } from 'zod';

const applySchema = z.object({
  title: z.string().trim().min(1, 'título é obrigatório').max(200),
  dueAt: z.string().datetime({ offset: true }).refine((v) => !Number.isNaN(new Date(v).getTime()), 'data inválida'),
  categoryId: z.string().cuid().optional().nullable(),
  priority: z.enum(['alta', 'media', 'baixa']).optional(),
  subtasks: z.array(z.object({ title: z.string().trim().min(1).max(200), done: z.boolean().optional(), ordem: z.number().int().min(0).optional() })).optional(),
  reminderPreset: z.enum(['agora', '30min', '1h', '1dia', 'custom']).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const parsed = applySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { id } = await params;
  const result = await applyTemplateToTask({ templateId: id, userId, ...parsed.data });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ task: result.task, occurrence: result.occurrence }, { status: 201 });
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npx vitest run tests/api/templates.test.ts`
Expected: 3 testes PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/template.ts src/lib/validation.ts src/app/api/templates tests/api/templates.test.ts && git commit -m "feat: modelos de tarefas (crud + apply como cópia)"
```
