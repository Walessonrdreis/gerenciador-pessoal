import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { templateSchema } from '@/lib/validation';

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const templates = await prisma.taskTemplate.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(templates);
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const parsed = templateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { name, subtasks, priority, categoryId, reminderPreset } = parsed.data;

  const template = await prisma.taskTemplate.create({
    data: {
      userId,
      name,
      subtasks: (subtasks as object | undefined) ?? undefined,
      priority,
      categoryId,
      reminderPreset,
    },
  });
  return NextResponse.json(template, { status: 201 });
}
