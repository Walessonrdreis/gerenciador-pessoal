# Task 6: API — editar, excluir, concluir com recorrência + subtarefas + reorder

**Files:**
- Create: `src/app/api/tasks/[id]/route.ts` (PATCH, DELETE)
- Create: `src/app/api/tasks/[id]/subtasks/route.ts` (POST)
- Create: `src/app/api/tasks/[id]/subtasks/[subtaskId]/route.ts` (PATCH, DELETE)
- Create: `src/app/api/tasks/reorder/route.ts` (POST)
- Test: `tests/api/tasks-complete.test.ts`

**Interfaces:**
- Consumes: `nextOccurrence`, `parseRule` (Task 4), `taskUpdateSchema`, `subtaskSchema` (Task 5)
- Produces:
  - `PATCH /api/tasks/:id` body `{ done?: boolean, occurrenceId?, ...camposEditaveis }` →
    - `done: true` com `occurrenceId` → marca a ocorrência concluída; se a tarefa tem `rule`, cria a próxima ocorrência e devolve `{ occurrence, next: TaskRow | null }`
    - `done: false` com `occurrenceId` → desfaz (volta para `pendente`)
    - sem `done` → atualiza a tarefa (campos parciais, inclui `subtasks` e `ordem`)
  - `DELETE /api/tasks/:id` → `{ ok: true }` (cascata remove subtarefas, ocorrências; lembretes/QStash entram na Task 12)
  - `POST /api/tasks/:id/subtasks` body `{ title }` → `201 { id, title, done, ordem }`
  - `PATCH /api/tasks/:id/subtasks/:subtaskId` body `{ title?, done? }` → subtarefa atualizada
  - `DELETE /api/tasks/:id/subtasks/:subtaskId` → `{ ok: true }`
  - `POST /api/tasks/reorder` body `[{ taskId, ordem }]` → `{ ok: true }` (reordena em lote, evita N chamadas ao arrastar)

- [ ] **Step 1: Testes que falham**

`tests/api/tasks-complete.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';

vi.mock('@/lib/auth', () => ({ getAuthUserId: vi.fn() }));
import { getAuthUserId } from '@/lib/auth';
import { PATCH, DELETE } from '@/app/api/tasks/[id]/route';
import { POST as reorder } from '@/app/api/tasks/reorder/route';
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

describe('PATCH — subtarefa', () => {
  it('marca subtarefa concluída', async () => {
    const { task } = await createTask({
      title: 'Com checklist',
      dueAt: '2026-08-13T10:00:00.000Z',
      subtasks: [{ title: 'item 1' }],
    });
    const sub = await prisma.subtask.findFirstOrThrow({ where: { taskId: task.id } });

    const req = new Request(`http://localhost/api/tasks/${task.id}/subtasks/${sub.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ done: true }),
      headers: { 'content-type': 'application/json' },
    });
    const res = await PATCH(req as never, { params: Promise.resolve({ id: task.id, subtaskId: sub.id }) });
    expect(res.status).toBe(200);
    expect((await res.json()).done).toBe(true);
  });
});

describe('POST /api/tasks/reorder', () => {
  it('reordena em lote', async () => {
    const a = await createTask({ title: 'A', dueAt: '2026-08-13T10:00:00.000Z' });
    const b = await createTask({ title: 'B', dueAt: '2026-08-13T11:00:00.000Z' });

    const req = new Request('http://localhost/api/tasks/reorder', {
      method: 'POST',
      body: JSON.stringify([
        { taskId: a.task.id, ordem: 1 },
        { taskId: b.task.id, ordem: 0 },
      ]),
      headers: { 'content-type': 'application/json' },
    });
    const res = await reorder(req as never);
    expect(res.status).toBe(200);

    const aUpdated = await prisma.task.findUniqueOrThrow({ where: { id: a.task.id } });
    const bUpdated = await prisma.task.findUniqueOrThrow({ where: { id: b.task.id } });
    expect(aUpdated.ordem).toBe(1);
    expect(bUpdated.ordem).toBe(0);
  });
});

describe('DELETE /api/tasks/:id', () => {
  it('exclui tarefa com subtarefas (cascata)', async () => {
    const { task } = await createTask({
      title: 'Excluir',
      dueAt: '2026-08-13T10:00:00.000Z',
      subtasks: [{ title: 'filha' }],
    });

    const req = new Request(`http://localhost/api/tasks/${task.id}`, { method: 'DELETE' });
    const res = await DELETE(req as never, { params: Promise.resolve({ id: task.id }) });
    expect(res.status).toBe(200);
    const subCount = await prisma.subtask.count({ where: { taskId: task.id } });
    expect(subCount).toBe(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/api/tasks-complete.test.ts`
Expected: FAIL (rotas não existem).

- [ ] **Step 3: Implementar a rota principal**

`src/app/api/tasks/[id]/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { taskUpdateSchema } from '@/lib/validation';
import { nextOccurrence, parseRule } from '@/lib/recurrence';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; subtaskId?: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id, subtaskId } = await params;
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) return NextResponse.json({ error: 'tarefa não encontrada' }, { status: 404 });

  const parsed = taskUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { done, occurrenceId, subtasks, ...fields } = parsed.data;

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
            ordem: task.ordem,
            subtasks: [],
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

  if (subtaskId) {
    const sub = await prisma.subtask.findFirst({ where: { id: subtaskId, taskId: task.id } });
    if (!sub) return NextResponse.json({ error: 'subtarefa não encontrada' }, { status: 404 });
    const updated = await prisma.subtask.update({
      where: { id: sub.id },
      data: {
        ...(fields.title !== undefined ? { title: fields.title } : {}),
        ...(fields.done !== undefined ? { done: fields.done } : {}),
      },
    });
    return NextResponse.json(updated);
  }

  if (Object.keys(fields).length === 0 && !subtasks) {
    return NextResponse.json({ error: 'nenhum campo para atualizar' }, { status: 400 });
  }

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
      ...(fields.ordem !== undefined ? { ordem: fields.ordem } : {}),
      ...(fields.reminder?.preset ? { reminderPreset: fields.reminder.preset } : {}),
      ...(subtasks
        ? {
            subtasks: {
              deleteMany: {},
              create: subtasks.map((s, i) => ({ title: s.title, done: s.done, ordem: s.ordem ?? i })),
            },
          }
        : {}),
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

> **Nota de design:** o `PATCH` trata `subtaskId` como rota de subtarefa quando presente. A pasta `[id]/subtasks/[subtaskId]` reexporta essa rota (Step 5) para o Next.js rotear `PATCH /api/tasks/:id/subtasks/:subtaskId` para cá. Alternativa mais simples seria criar um handler próprio na pasta de subtarefas; se preferir, crie `src/app/api/tasks/[id]/subtasks/[subtaskId]/route.ts` que reexporta `{ PATCH }` de `../[id]/route` — o Next.js aceita reexport.

- [ ] **Step 4: Rotas de reorder e subtarefa (POST)**

`src/app/api/tasks/reorder/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { z } from 'zod';

const reorderSchema = z.array(
  z.object({
    taskId: z.string().cuid(),
    ordem: z.number().int().min(0),
  })
).min(1);

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const parsed = reorderSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'lista de reordenação inválida' }, { status: 400 });

  const tasks = await prisma.task.findMany({
    where: { id: { in: parsed.data.map((t) => t.taskId) }, userId },
  });
  if (tasks.length !== parsed.data.length) {
    return NextResponse.json({ error: 'alguma tarefa não pertence ao usuário' }, { status: 404 });
  }

  await prisma.$transaction(
    parsed.data.map((t) => prisma.task.update({ where: { id: t.taskId }, data: { ordem: t.ordem } }))
  );
  return NextResponse.json({ ok: true });
}
```

`src/app/api/tasks/[id]/subtasks/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { subtaskSchema } from '@/lib/validation';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) return NextResponse.json({ error: 'tarefa não encontrada' }, { status: 404 });

  const parsed = subtaskSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const count = await prisma.subtask.count({ where: { taskId: id } });
  const sub = await prisma.subtask.create({
    data: { taskId: id, title: parsed.data.title, done: false, ordem: count },
  });
  return NextResponse.json(sub, { status: 201 });
}
```

- [ ] **Step 5: Rota de subtarefa individual (reexport)**

`src/app/api/tasks/[id]/subtasks/[subtaskId]/route.ts`:

```ts
export { PATCH, DELETE } from '../[id]/route';
```

> Este reexport faz `PATCH /api/tasks/:id/subtasks/:subtaskId` cair no `PATCH` principal (que lê `subtaskId`). O `DELETE` do principal exclui a **tarefa**, não a subtarefa — se quiser excluir só a subtarefa, implemente um `DELETE` próprio aqui:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; subtaskId: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id, subtaskId } = await params;
  const sub = await prisma.subtask.findFirst({ where: { id: subtaskId, task: { id, userId } } });
  if (!sub) return NextResponse.json({ error: 'subtarefa não encontrada' }, { status: 404 });

  await prisma.subtask.delete({ where: { id: sub.id } });
  return NextResponse.json({ ok: true });
}
```

> Use o `DELETE` próprio (não o reexport) — o reexport apagaria a tarefa inteira. Se preferir simplicidade, troque o reexport por um arquivo completo com `PATCH` e `DELETE` de subtarefa (repetindo o handler de subtarefa do Step 3), evitando a rota compartilhada.

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run tests/api/tasks-complete.test.ts`
Expected: 5 testes PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/tasks tests/api/tasks-complete.test.ts && git commit -m "feat: editar, excluir, concluir com recorrência + subtarefas + reorder"
```
