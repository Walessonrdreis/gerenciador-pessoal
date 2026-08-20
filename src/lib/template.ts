import { Prisma } from '@prisma/client';
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
      rule: Prisma.JsonNull,
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
