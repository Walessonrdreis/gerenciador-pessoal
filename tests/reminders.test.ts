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
    Receiver: vi.fn().mockImplementation(() => ({
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

  it('preset custom sem customAt cai em agora (não lança)', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Custom sem hora' } });
    const occ = await prisma.taskOccurrence.create({
      data: { taskId: task.id, dueAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    await createReminderForOccurrence({
      taskId: task.id,
      occurrenceId: occ.id,
      dueAt: occ.dueAt,
      preset: 'custom', // sem customAt — o path de re-schedule do done:true chega assim
    });

    const reminder = await prisma.reminder.findFirst({ where: { taskId: task.id } });
    expect(reminder).not.toBeNull();
    expect(reminder!.remindAt.getTime()).toBe(occ.dueAt.getTime()); // = agora (dueAt)
  });

  it('agenda push deslocado pela antecedência (leadMinutes)', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Com lead' } });
    const occ = await prisma.taskOccurrence.create({
      data: { taskId: task.id, dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000) },
    });

    await createReminderForOccurrence({
      taskId: task.id,
      occurrenceId: occ.id,
      dueAt: occ.dueAt,
      preset: 'agora',
      leadMinutes: 15,
    });

    const reminder = await prisma.reminder.findFirst({ where: { taskId: task.id } });
    expect(reminder).not.toBeNull();
    expect(reminder!.leadMinutes).toBe(15);
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
