import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { prisma } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';

// Cron QStash (1 por usuário, configurado manualmente no painel da Upstash —
// automatização de criar/remover cron por usuário fica como melhoria). Valida a
// assinatura como o trigger: o Receiver é quem verifica (Client não tem verify).
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');
  if (!signature) return NextResponse.json({ error: 'sem assinatura' }, { status: 401 });

  const receiver = new Receiver({});
  const valid = await receiver.verify({ signature, body: rawBody });
  if (!valid) return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 });

  // body: { userId } — o cron envia 1 push por usuário com pendentes do dia
  let payload: { userId?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'corpo inválido' }, { status: 400 });
  }
  if (!payload.userId) return NextResponse.json({ error: 'userId ausente' }, { status: 400 });

  const now = new Date();
  // Dia local em America/Sao_Paulo: Brasil sem DST desde 2019 → offset fixo
  // UTC-3, então 00:00 BRT = 03:00 UTC (Date.UTC(y, m, d, 3))
  const [d, m, y] = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(now)
    .split('/')
    .map(Number);
  const startOfDay = new Date(Date.UTC(y, m - 1, d, 3));
  const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

  const pendentes = await prisma.taskOccurrence.count({
    where: {
      status: 'pendente',
      dueAt: { gte: startOfDay, lt: endOfDay },
      task: { userId: payload.userId },
    },
  });

  if (pendentes === 0) return NextResponse.json({ ok: true, sent: 0 });

  const result = await sendPushToUser(payload.userId, {
    title: 'seu dia',
    body: `você tem ${pendentes} tarefa(s) hoje`,
    id: `digest-${startOfDay.toISOString()}`,
  });
  return NextResponse.json({ ok: true, sent: result.sent });
}
