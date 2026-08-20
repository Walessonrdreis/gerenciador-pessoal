import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { applyTemplateToTask } from '@/lib/template';
import { z } from 'zod';

const applySchema = z.object({
  title: z.string().trim().min(1, 'título é obrigatório').max(200),
  dueAt: z.string().datetime({ offset: true }).refine((v) => !Number.isNaN(new Date(v).getTime()), 'data inválida'),
  categoryId: z.string().cuid().optional().nullable(),
  priority: z.enum(['alta', 'media', 'baixa']).optional(),
  subtasks: z.array(z.object({ title: z.string().trim().min(1).max(200), done: z.boolean().optional(), ordem: z.number().int().min(0).optional() })).optional(),
  reminderPreset: z.enum(['agora', '30min', '1h', '1dia', 'custom']).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const parsed = applySchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

  const { id } = await params;
  const result = await applyTemplateToTask({ templateId: id, userId, ...parsed.data });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  return NextResponse.json({ task: result.task, occurrence: result.occurrence }, { status: 201 });
}
