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
