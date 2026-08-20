import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { z } from 'zod';

const reorderSchema = z
  .array(
    z.object({
      taskId: z.string().cuid(),
      ordem: z.number().int().min(0),
    })
  )
  .min(1);

// POST: reordena em lote (evita N chamadas ao arrastar). Toda a lista
// precisa pertencer ao usuário, senão 404.
export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const parsed = reorderSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'lista de reordenação inválida' }, { status: 400 });

  const tasks = await prisma.task.findMany({
    where: { id: { in: parsed.data.map((t) => t.taskId) }, userId },
  });
  if (tasks.length !== parsed.data.length) {
    return NextResponse.json({ error: 'alguma tarefa não pertence ao usuário' }, { status: 404 });
  }

  await prisma.$transaction(
    parsed.data.map((t) => prisma.task.update({ where: { id: t.taskId }, data: { ordem: t.ordem } }))
  );
  return NextResponse.json({ ok: true });
}
