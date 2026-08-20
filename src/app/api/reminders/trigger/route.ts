import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { prisma } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';
import { scheduleRepush } from '@/lib/reminders';

const REPUSH_INTERVAL_MIN = 10;
const REPUSH_MAX_PER_DAY = 30;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');
  if (!signature) return NextResponse.json({ error: 'sem assinatura' }, { status: 401 });

  // Recebe as chaves de assinatura via env (QSTASH_CURRENT/NEXT_SIGNING_KEY) — o
  // Receiver do SDK é quem valida a assinatura (Client não tem verify)
  const receiver = new Receiver({});
  const valid = await receiver.verify({ signature, body: rawBody });
  if (!valid) return NextResponse.json({ error: 'assinatura inválida' }, { status: 401 });

  let payload: { reminderId?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'corpo inválido' }, { status: 400 });
  }
  if (!payload.reminderId) return NextResponse.json({ error: 'reminderId ausente' }, { status: 400 });

  const reminder = await prisma.reminder.findUnique({ where: { id: payload.reminderId } });
  if (!reminder) return NextResponse.json({ ok: true }); // já cancelado: sucesso silencioso

  if (reminder.status !== 'pendente') return NextResponse.json({ ok: true });

  const task = await prisma.task.findUnique({ where: { id: reminder.taskId } });
  if (!task) return NextResponse.json({ ok: true });

  // Se a tarefa (ou a ocorrência) foi concluída/ignorada, para — não re-envia
  const occurrence = reminder.occurrenceId
    ? await prisma.taskOccurrence.findUnique({ where: { id: reminder.occurrenceId } })
    : null;
  if (occurrence && occurrence.status !== 'pendente') return NextResponse.json({ ok: true });

  const result = await sendPushToUser(task.userId, {
    title: task.title,
    body: `vence ${new Date(reminder.remindAt).toLocaleString('pt-BR')}`,
    id: reminder.id,
  });

  // Re-push: se ainda pendente e dentro do teto do dia, agenda +10min
  let nextRepushAt: Date | null = null;
  let repushScheduleId: string | null = null;
  const dayStart = new Date(reminder.remindAt);
  dayStart.setUTCHours(0, 0, 0, 0);
  const repushesToday = await prisma.reminder.count({
    where: {
      taskId: reminder.taskId,
      status: 'pendente',
      remindAt: { gte: dayStart },
    },
  });
  const endOfDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();
  if (now.getTime() < endOfDay.getTime() && repushesToday < REPUSH_MAX_PER_DAY) {
    nextRepushAt = new Date(now.getTime() + REPUSH_INTERVAL_MIN * 60 * 1000);
    try {
      repushScheduleId = await scheduleRepush(reminder.id, now);
    } catch (e) {
      console.error('falha ao agendar re-push', e);
      nextRepushAt = null;
    }
  }

  await prisma.reminder.update({
    where: { id: reminder.id },
    data: {
      status: result.sent > 0 ? 'enviado' : 'falhou',
      sentAt: new Date(),
      // o id do re-push sobrescreve o anterior: é ele que cancelamento/edição derrubam
      ...(repushScheduleId ? { qstashScheduleId: repushScheduleId } : {}),
    },
  });

  return NextResponse.json({ ok: true, sent: result.sent, nextRepushAt });
}
