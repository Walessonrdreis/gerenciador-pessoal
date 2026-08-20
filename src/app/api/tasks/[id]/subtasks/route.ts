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
