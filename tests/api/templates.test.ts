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
