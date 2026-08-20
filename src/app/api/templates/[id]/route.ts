import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { templateSchema } from '@/lib/validation';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.taskTemplate.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: 'modelo não encontrado' }, { status: 404 });

  const parsed = templateSchema.partial().safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const updated = await prisma.taskTemplate.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.subtasks !== undefined ? { subtasks: parsed.data.subtasks as object } : {}),
      ...(parsed.data.priority !== undefined ? { priority: parsed.data.priority } : {}),
      ...(parsed.data.categoryId !== undefined ? { categoryId: parsed.data.categoryId } : {}),
      ...(parsed.data.reminderPreset !== undefined ? { reminderPreset: parsed.data.reminderPreset } : {}),
    },
  });
  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.taskTemplate.findFirst({ where: { id, userId } });
  if (!existing) return NextResponse.json({ error: 'modelo não encontrado' }, { status: 404 });

  await prisma.taskTemplate.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
