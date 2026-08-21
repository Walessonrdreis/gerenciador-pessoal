import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { taskUpdateSchema } from '@/lib/validation';
import { nextOccurrence, parseRule } from '@/lib/recurrence';

// PATCH:
// - subtaskId no path → atualiza a subtarefa (title/done) — ANTES dos branches
//   de done: o teste do brief chama este PATCH com { done: true } + subtaskId
//   e espera update de subtarefa (não conclusão de ocorrência)
// - { done: true, occurrenceId } → conclui a ocorrência; com regra, cria a próxima e devolve { occurrence, next }
// - { done: false, occurrenceId } → desfaz (volta para pendente)
// - demais campos → atualiza a tarefa (parciais; `subtasks` substitui a lista, com fallback de ordem)
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
  const { done, ignored, occurrenceId, subtasks, ...fields } = parsed.data;

  if (subtaskId) {
    const sub = await prisma.subtask.findFirst({ where: { id: subtaskId, taskId: task.id } });
    if (!sub) return NextResponse.json({ error: 'subtarefa não encontrada' }, { status: 404 });
    const updated = await prisma.subtask.update({
      where: { id: sub.id },
      data: {
        ...(fields.title !== undefined ? { title: fields.title } : {}),
        ...(done !== undefined ? { done } : {}),
      },
    });
    return NextResponse.json(updated);
  }

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

  if (ignored === true) {
    if (!occurrenceId) return NextResponse.json({ error: 'occurrenceId é obrigatório para ignorar' }, { status: 400 });
    const occurrence = await prisma.taskOccurrence.findFirst({ where: { id: occurrenceId, taskId: task.id } });
    if (!occurrence) return NextResponse.json({ error: 'ocorrência não encontrada' }, { status: 404 });
    const updated = await prisma.taskOccurrence.update({
      where: { id: occurrence.id },
      data: { status: 'ignorada', completedAt: null },
    });
    return NextResponse.json({ occurrence: { id: updated.id, status: updated.status, completedAt: null } });
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

  if (Object.keys(fields).length === 0 && !subtasks) {
    return NextResponse.json({ error: 'nenhum campo para atualizar' }, { status: 400 });
  }

  // dueAt mora na TaskOccurrence, não na Task — reagenda a ocorrência pendente mais próxima
  if (fields.dueAt) {
    const activeOcc = await prisma.taskOccurrence.findFirst({
      where: { taskId: task.id, status: 'pendente' },
      orderBy: { dueAt: 'asc' },
    });
    if (activeOcc) {
      await prisma.taskOccurrence.update({ where: { id: activeOcc.id }, data: { dueAt: new Date(fields.dueAt) } });
    }
  }

  if (fields.categoryId) {
    const cat = await prisma.category.findFirst({ where: { id: fields.categoryId, userId } });
    if (!cat) return NextResponse.json({ error: 'categoria não encontrada' }, { status: 400 });
  }

  if (fields.reminder?.preset) {
    const { createReminderForOccurrence, cancelScheduledReminder } = await import('@/lib/reminders');
    const activeOcc = await prisma.taskOccurrence.findFirst({
      where: { taskId: task.id, status: 'pendente' },
      orderBy: { dueAt: 'asc' },
    });
    if (activeOcc) {
      const existing = await prisma.reminder.findFirst({
        where: { taskId: task.id, occurrenceId: activeOcc.id, status: 'pendente' },
      });
      if (existing) {
        if (existing.qstashScheduleId) await cancelScheduledReminder(existing.qstashScheduleId);
        // não deixa linha pendente órfã: a antiga é substituída pela nova
        await prisma.reminder.update({ where: { id: existing.id }, data: { status: 'falhou' } });
      }
      await createReminderForOccurrence({
        taskId: task.id,
        occurrenceId: activeOcc.id,
        dueAt: activeOcc.dueAt,
        preset: fields.reminder.preset,
        customAt: fields.reminder.customAt,
        leadMinutes: fields.reminder.leadMinutes,
      });
    }
  }

  if (fields.reminder === null) {
    const { cancelScheduledReminder } = await import('@/lib/reminders');
    const pendentes = await prisma.reminder.findMany({ where: { taskId: task.id, status: 'pendente' } });
    // 1) vira a linha para `falhou` ANTES de cancelar o schedule: se o cancelamento
    //    falhar, o schedule órfão que disparar depois esbarra no guard
    //    `status !== 'pendente'` (trigger) e morre — sem re-push do lembrete removido
    await prisma.reminder.updateMany({ where: { taskId: task.id, status: 'pendente' }, data: { status: 'falhou' } });
    await Promise.allSettled(
      pendentes.map((r) => (r.qstashScheduleId ? cancelScheduledReminder(r.qstashScheduleId) : Promise.resolve()))
    );
    // limpa o preset da tarefa: sem isso o lembrete "removido" ressuscita ao
    // concluir a ocorrência (done:true re-agenda com o preset fantasma)
    await prisma.task.update({ where: { id: task.id }, data: { reminderPreset: null } });
  }

  const updatedTask = await prisma.task.update({
    where: { id: task.id },
    // TaskUpdateInput (checked) rejeita `categoryId: null` via spread — uso o
    // unchecked, que aceita o scalar com null (mesmo efeito, tipo limpo)
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
    } as Prisma.TaskUncheckedUpdateInput,
  });

  return NextResponse.json({ task: updatedTask });
}

// DELETE: remove a tarefa; subtarefas e ocorrências caem em cascata (onDelete: Cascade).
// Lembretes/QStash entram na Task 12.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id } = await params;
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) return NextResponse.json({ error: 'tarefa não encontrada' }, { status: 404 });

  const reminders = await prisma.reminder.findMany({
    where: { taskId: task.id, qstashScheduleId: { not: null } },
  });
  const { cancelScheduledReminder } = await import('@/lib/reminders');
  await Promise.allSettled(
    reminders.map((r) => (r.qstashScheduleId ? cancelScheduledReminder(r.qstashScheduleId) : Promise.resolve()))
  );

  await prisma.task.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
