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
