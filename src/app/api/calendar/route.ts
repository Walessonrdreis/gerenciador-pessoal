import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const month = req.nextUrl.searchParams.get('month'); // YYYY-MM
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month deve ser YYYY-MM' }, { status: 400 });
  }
  const [ano, mes] = month.split('-').map(Number);
  const start = new Date(Date.UTC(ano, mes - 1, 1));
  const end = new Date(Date.UTC(ano, mes, 1));

  const occurrences = await prisma.taskOccurrence.findMany({
    where: {
      task: { userId },
      dueAt: { gte: start, lt: end },
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

  const byDay: Record<string, { count: number; tasks: unknown[] }> = {};
  for (const o of occurrences) {
    const key = `${o.dueAt.getUTCFullYear()}-${String(o.dueAt.getUTCMonth() + 1).padStart(2, '0')}-${String(o.dueAt.getUTCDate()).padStart(2, '0')}`;
    const row = {
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
    };
    if (!byDay[key]) byDay[key] = { count: 0, tasks: [] };
    byDay[key].count += 1;
    byDay[key].tasks.push(row);
  }

  return NextResponse.json(byDay);
}
