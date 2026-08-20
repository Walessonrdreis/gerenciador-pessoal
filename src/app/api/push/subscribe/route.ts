import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';
import { z } from 'zod';

const subSchema = z.object({
  endpoint: z.string().url().min(20),
  p256dh: z.string().min(10),
  auth: z.string().min(10),
});

export async function POST(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const parsed = subSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'subscription inválida' }, { status: 400 });

  const { endpoint, p256dh, auth } = parsed.data;
  const sub = await prisma.pushSubscription.upsert({
    where: { endpoint },
    // re-atribui a subscription ao usuário atual: o unique fica no endpoint, mas
    // se outro usuário logar no mesmo navegador, a posse muda para ele
    update: { userId, p256dh, auth },
    create: { userId, endpoint, p256dh, auth },
  });
  return NextResponse.json({ id: sub.id });
}

export async function DELETE(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const { endpoint } = (await req.json()) as { endpoint?: string };
  if (!endpoint) return NextResponse.json({ error: 'endpoint é obrigatório' }, { status: 400 });

  await prisma.pushSubscription.deleteMany({ where: { userId, endpoint } });
  return NextResponse.json({ ok: true });
}
