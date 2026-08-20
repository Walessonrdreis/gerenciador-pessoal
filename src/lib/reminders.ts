import { Client } from '@upstash/qstash';
import { prisma } from '@/lib/db';

// Constantes do re-push: vivem aqui (lib) e o trigger importa — evitar duplicação
export const REPUSH_INTERVAL_MIN = 10;
export const REPUSH_MAX_PER_DAY = 30;

function qstash(): Client {
  return new Client({ token: process.env.QSTASH_TOKEN ?? 'mock-token' });
}

function oneShotCron(at: Date): string {
  return `${at.getUTCMinutes()} ${at.getUTCHours()} ${at.getUTCDate()} ${at.getUTCMonth() + 1} *`;
}

export async function scheduleReminder(reminderId: string, remindAt: Date): Promise<{ qstashScheduleId: string }> {
  const client = qstash();
  const baseUrl = process.env.APP_URL ?? 'http://localhost:3000';
  const res = await client.schedules.create({
    destination: `${baseUrl}/api/reminders/trigger`,
    cron: oneShotCron(remindAt),
    body: JSON.stringify({ reminderId }),
    retries: 5,
  });
  return { qstashScheduleId: res.scheduleId };
}

export async function cancelScheduledReminder(qstashScheduleId: string): Promise<void> {
  const client = qstash();
  await client.schedules.delete(qstashScheduleId);
}

/** Agenda o re-push em +10min (chamado a cada disparo do trigger enquanto a tarefa estiver pendente). Devolve o novo id do agendamento, que sobrescreve o anterior. */
export async function scheduleRepush(reminderId: string, after: Date): Promise<string> {
  const { qstashScheduleId } = await scheduleReminder(
    reminderId,
    new Date(after.getTime() + REPUSH_INTERVAL_MIN * 60 * 1000)
  );
  return qstashScheduleId;
}

export async function createReminderForOccurrence(opts: {
  taskId: string;
  occurrenceId: string;
  dueAt: Date;
  preset: string;
  customAt?: string;
  leadMinutes?: number;
}): Promise<void> {
  const { computeRemindAt, computePushAt } = await import('@/lib/reminder-rule');
  // preset 'custom' só vale com customAt (escolha de criação); sem ele, cai em
  // 'agora' — senão computeRemindAt lança com new Date(NaN)
  const preset = opts.preset === 'custom' && !opts.customAt ? 'agora' : opts.preset;
  const remindAt = computeRemindAt(opts.dueAt, preset as never, opts.customAt);
  // o push dispara deslocado pela antecedência (leadMinutes); o remindAt da linha continua sendo o lembrete real
  const pushAt = computePushAt(remindAt, opts.leadMinutes);
  if (pushAt.getTime() <= Date.now()) return; // disparo no passado: não agenda

  const reminder = await prisma.reminder.create({
    data: {
      taskId: opts.taskId,
      occurrenceId: opts.occurrenceId,
      remindAt,
      leadMinutes: opts.leadMinutes ?? null,
    },
  });
  try {
    const { qstashScheduleId } = await scheduleReminder(reminder.id, pushAt);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { qstashScheduleId } });
  } catch (e) {
    console.error('falha ao agendar lembrete', e);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { status: 'falhou' } });
  }
}
