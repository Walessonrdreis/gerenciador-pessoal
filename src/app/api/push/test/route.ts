import { NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { sendPushToUser } from '@/lib/push';

export async function POST() {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const result = await sendPushToUser(userId, {
    id: 'test',
    title: 'notificação de teste',
    body: 'se você está vendo isso, o push funciona.',
  });
  return NextResponse.json(result);
}
