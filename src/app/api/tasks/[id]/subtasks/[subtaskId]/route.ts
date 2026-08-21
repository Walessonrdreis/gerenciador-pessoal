import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { taskUpdateSchema } from '@/lib/validation';

// Handler próprio (não reexport do PATCH principal): um reexport do DELETE do
// `[id]/route` apagaria a TAREFA, não a subtarefa.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; subtaskId: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id, subtaskId } = await params;
  const sub = await prisma.subtask.findFirst({ where: { id: subtaskId, task: { id, userId } } });
  if (!sub) return NextResponse.json({ error: 'subtarefa não encontrada' }, { status: 404 });

  const parsed = taskUpdateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { title, done, ordem } = parsed.data;
  if (title === undefined && done === undefined && ordem === undefined) {
    return NextResponse.json({ error: 'nenhum campo para atualizar' }, { status: 400 });
  }

  const updated = await prisma.subtask.update({
    where: { id: sub.id },
    data: {
      ...(title !== undefined ? { title } : {}),
      ...(done !== undefined ? { done } : {}),
      ...(ordem !== undefined ? { ordem } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; subtaskId: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id, subtaskId } = await params;
  const sub = await prisma.subtask.findFirst({ where: { id: subtaskId, task: { id, userId } } });
  if (!sub) return NextResponse.json({ error: 'subtarefa não encontrada' }, { status: 404 });

  await prisma.subtask.delete({ where: { id: sub.id } });
  return NextResponse.json({ ok: true });
}
