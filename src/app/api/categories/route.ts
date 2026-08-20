import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { categorySchema } from '@/lib/validation';

export async function GET() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  const categories = await prisma.category.findMany({
    where: { userId },
    orderBy: { name: 'asc' },
  });
  return NextResponse.json(categories);
}

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const parsed = categorySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }
  const { name, color } = parsed.data;

  const exists = await prisma.category.findFirst({ where: { userId, name } });
  if (exists) return NextResponse.json({ error: 'categoria já existe' }, { status: 409 });

  const category = await prisma.category.create({ data: { userId, name, color } });
  return NextResponse.json(category, { status: 201 });
}
