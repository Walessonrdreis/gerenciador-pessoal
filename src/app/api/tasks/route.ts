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
  const dia = params.get('dia'); // YYYY-MM-DD (do calendário)
  if (dia && !/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
    return NextResponse.json({ error: 'dia deve ser YYYY-MM-DD' }, { status: 400 });
  }

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
      ...(dia
        ? {
            dueAt: {
              gte: new Date(`${dia}T00:00:00.000Z`),
              lt: new Date(`${dia}T23:59:59.999Z`),
            },
          }
        : {}),
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

  if (parsed.data.reminder?.preset) {
    const { createReminderForOccurrence } = await import('@/lib/reminders');
    await createReminderForOccurrence({
      taskId: task.id,
      occurrenceId: occurrence.id,
      dueAt: new Date(dueAt),
      preset: parsed.data.reminder.preset,
      customAt: parsed.data.reminder.customAt,
      leadMinutes: parsed.data.reminder.leadMinutes,
    });
  }

  return NextResponse.json({ task, occurrence }, { status: 201 });
}
