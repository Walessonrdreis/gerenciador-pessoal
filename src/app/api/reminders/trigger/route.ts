import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { prisma } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';
import { cancelScheduledReminder, REPUSH_INTERVAL_MIN, REPUSH_MAX_PER_DAY, scheduleRepush } from '@/lib/reminders';

// Semântica de status: enquanto a cadeia de re-push deve continuar (ocorrência
// ainda pendente, dentro do dia e do teto), o lembrete fica `pendente`. Ele só
// vira `enviado` (final) quando a cadeia TERMINA: ocorrência concluída/ignorada,
// teto de 30/dia atingido ou passou do fim do dia. Ao finalizar, o schedule
// QStash pendente é cancelado — o cron one-shot é anual (cron não tem ano) e um
// refire de 2027 não pode reabrir a cadeia. Com isso o guard de status é seguro:
// só vira `enviado` com o schedule derrubado.
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

  if (reminder.status !== 'pendente') return NextResponse.json({ ok: true }); // cadeia já finalizada

  const r = reminder; // não-nulo dali em diante (narrowing não entra em closures)

  const task = await prisma.task.findUnique({ where: { id: r.taskId } });
  if (!task) return NextResponse.json({ ok: true });

  const occurrence = r.occurrenceId
    ? await prisma.taskOccurrence.findUnique({ where: { id: r.occurrenceId } })
    : null;

  /** Finaliza a cadeia: cancela o schedule pendente e marca o lembrete como final. */
  async function finalize() {
    if (r.qstashScheduleId) {
      try {
        await cancelScheduledReminder(r.qstashScheduleId);
      } catch (e) {
        console.error('falha ao cancelar schedule no fim da cadeia', e);
      }
    }
    await prisma.reminder.update({
      where: { id: r.id },
      data: { status: 'enviado', sentAt: new Date(), qstashScheduleId: null },
    });
  }

  // Fim de cadeia (a): a ocorrência foi concluída/ignorada — não re-envia
  if (occurrence && occurrence.status !== 'pendente') {
    await finalize();
    return NextResponse.json({ ok: true });
  }

  const result = await sendPushToUser(task.userId, {
    title: task.title,
    body: `vence ${new Date(r.remindAt).toLocaleString('pt-BR')}`,
    id: r.id,
  });

  // Teto do dia: conta os disparos de HOJE (sentAt >= início do dia) — re-pushes
  // reutilizam a mesma linha de Reminder, então contar linhas por remindAt pegaria
  // ~1 sempre; e `gte dayStart` pegaria lembretes de amanhã. A contagem roda antes
  // deste disparo gravar o sentAt, então compara pushesToday + 1 (este disparo)
  const dayStart = new Date(r.remindAt);
  dayStart.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const now = new Date();
  const pushesToday = await prisma.reminder.count({
    where: {
      taskId: r.taskId,
      status: 'pendente',
      sentAt: { gte: dayStart },
    },
  });

  if (now.getTime() < endOfDay.getTime() && pushesToday + 1 <= REPUSH_MAX_PER_DAY) {
    // cadeia continua: mantém `pendente`, agenda re-push +10min e guarda o novo
    // id (sobrescreve o anterior — é ele que finalização/cancelamento derrubam)
    const nextRepushAt = new Date(now.getTime() + REPUSH_INTERVAL_MIN * 60 * 1000);
    try {
      const qstashScheduleId = await scheduleRepush(r.id, now);
      await prisma.reminder.update({
        where: { id: r.id },
        data: { status: 'pendente', sentAt: new Date(), qstashScheduleId },
      });
      return NextResponse.json({ ok: true, sent: result.sent, nextRepushAt });
    } catch (e) {
      console.error('falha ao agendar re-push', e);
      await finalize();
      return NextResponse.json({ ok: true, sent: result.sent, nextRepushAt: null });
    }
  }

  // Fim de cadeia (b/c): teto do dia atingido ou passou do fim do dia — finaliza
  await finalize();
  return NextResponse.json({ ok: true, sent: result.sent, nextRepushAt: null });
}
