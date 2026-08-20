# Task 12: Lembretes — QStash + trigger com re-push + resumo diário

**Files:**
- Create: `src/lib/reminder-rule.ts` (presets + `leadMinutes`)
- Create: `src/lib/reminders.ts` (agendamento, re-push)
- Create: `src/app/api/reminders/trigger/route.ts`
- Modify: `src/lib/validation.ts` (schema aceita `reminder` com `leadMinutes`)
- Modify: `src/app/api/tasks/route.ts` (POST agenda lembrete)
- Modify: `src/app/api/tasks/[id]/route.ts` (PATCH re-agenda; conclusão agenda o próximo)
- Test: `tests/reminder-rule.test.ts`, `tests/reminders.test.ts` (com QStash mockado)

**Interfaces:**
- Consumes: `nextOccurrence`, `parseRule` (Task 4), `sendPushToUser` (Task 11)
- Produces:
  - `src/lib/reminder-rule.ts`: `computeRemindAt(dueAt: Date, preset: 'agora'|'30min'|'1h'|'1dia'|'custom', customAt?: string): Date`
  - `src/lib/reminders.ts`:
    - `scheduleReminder(reminderId: string, remindAt: Date): Promise<{ qstashScheduleId: string }>`
    - `cancelScheduledReminder(qstashScheduleId: string): Promise<void>`
    - `createReminderForOccurrence(taskId: string, occurrenceId: string, dueAt: Date, preset: string, customAt?: string, leadMinutes?: number): Promise<void>`
    - `scheduleRepush(reminderId: string, after: Date): Promise<void>` (agenda re-push +10min)
  - `POST /api/reminders/trigger` (valida QStash; envia push; se pendente agenda re-push +10min)

- [ ] **Step 1: Regras de lembrete (TDD) — presets + `leadMinutes`**

`tests/reminder-rule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { computeRemindAt, computePushAt } from '@/lib/reminder-rule';

const due = new Date('2026-08-13T15:00:00.000Z');

describe('computeRemindAt', () => {
  it('agora = mesma hora', () => {
    expect(computeRemindAt(due, 'agora').toISOString()).toBe('2026-08-13T15:00:00.000Z');
  });
  it('30min antes', () => {
    expect(computeRemindAt(due, '30min').toISOString()).toBe('2026-08-13T14:30:00.000Z');
  });
  it('1h antes', () => {
    expect(computeRemindAt(due, '1h').toISOString()).toBe('2026-08-13T14:00:00.000Z');
  });
  it('1 dia antes', () => {
    expect(computeRemindAt(due, '1dia').toISOString()).toBe('2026-08-12T15:00:00.000Z');
  });
  it('custom usa a data informada', () => {
    expect(computeRemindAt(due, 'custom', '2026-08-13T08:00:00.000Z').toISOString()).toBe('2026-08-13T08:00:00.000Z');
  });
  it('custom inválida lança erro', () => {
    expect(() => computeRemindAt(due, 'custom', 'invalida')).toThrow();
  });
});

describe('computePushAt (antecedência desloca o push, não o lembrete)', () => {
  it('sem leadMinutes = mesma hora do lembrete', () => {
    expect(computePushAt(due, undefined).toISOString()).toBe('2026-08-13T15:00:00.000Z');
  });
  it('leadMinutes 15 = lembrete 15min antes', () => {
    expect(computePushAt(due, 15).toISOString()).toBe('2026-08-13T14:45:00.000Z');
  });
  it('leadMinutes 60 = lembrete 1h antes', () => {
    expect(computePushAt(due, 60).toISOString()).toBe('2026-08-13T14:00:00.000Z');
  });
  it('leadMinutes 1440 = lembrete 1 dia antes', () => {
    expect(computePushAt(due, 1440).toISOString()).toBe('2026-08-12T15:00:00.000Z');
  });
});
```

`src/lib/reminder-rule.ts`:

```ts
export const REMINDER_PRESETS = ['agora', '30min', '1h', '1dia', 'custom'] as const;
export type ReminderPreset = (typeof REMINDER_PRESETS)[number];

export function computeRemindAt(dueAt: Date, preset: ReminderPreset, customAt?: string): Date {
  switch (preset) {
    case 'agora':
      return new Date(dueAt.getTime());
    case '30min':
      return new Date(dueAt.getTime() - 30 * 60 * 1000);
    case '1h':
      return new Date(dueAt.getTime() - 60 * 60 * 1000);
    case '1dia':
      return new Date(dueAt.getTime() - 24 * 60 * 60 * 1000);
    case 'custom': {
      const d = customAt ? new Date(customAt) : new Date(NaN);
      if (Number.isNaN(d.getTime())) throw new Error('data de lembrete inválida');
      return d;
    }
  }
}

/** Horário do PUSH: lembrete deslocado pela antecedência (leadMinutes), sem mudar o `remindAt`. */
export function computePushAt(remindAt: Date, leadMinutes?: number | null): Date {
  if (!leadMinutes) return new Date(remindAt.getTime());
  return new Date(remindAt.getTime() - leadMinutes * 60 * 1000);
}
```

- [ ] **Step 2: Lib de agendamento (QStash mockado) + re-push**

`src/lib/reminders.ts`:

```ts
import { Client } from '@upstash/qstash';
import { prisma } from '@/lib/db';

const REPUSH_INTERVAL_MIN = 10;
const REPUSH_MAX_PER_DAY = 30;

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

/** Agenda o re-push em +10min (chamado a cada disparo do trigger enquanto a tarefa estiver pendente). */
export async function scheduleRepush(reminderId: string, after: Date): Promise<void> {
  await scheduleReminder(reminderId, new Date(after.getTime() + REPUSH_INTERVAL_MIN * 60 * 1000));
}

export async function createReminderForOccurrence(opts: {
  taskId: string;
  occurrenceId: string;
  dueAt: Date;
  preset: string;
  customAt?: string;
  leadMinutes?: number;
}): Promise<void> {
  const { computeRemindAt } = await import('@/lib/reminder-rule');
  const remindAt = computeRemindAt(opts.dueAt, opts.preset as never, opts.customAt);
  if (remindAt.getTime() <= Date.now()) return; // lembrete no passado: não agenda

  const reminder = await prisma.reminder.create({
    data: {
      taskId: opts.taskId,
      occurrenceId: opts.occurrenceId,
      remindAt,
      leadMinutes: opts.leadMinutes ?? null,
    },
  });
  try {
    const { qstashScheduleId } = await scheduleReminder(reminder.id, remindAt);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { qstashScheduleId } });
  } catch (e) {
    console.error('falha ao agendar lembrete', e);
    await prisma.reminder.update({ where: { id: reminder.id }, data: { status: 'falhou' } });
  }
}
```

> **Nota de design:** o re-push usa a MESMA rota `trigger` com o mesmo `reminderId` (a rota decide se re-envia ou para). O `qstashScheduleId` do re-push sobrescreve o anterior — se quiser rastrear a cadeia, guarde um array; para v1, o id do último agendamento é suficiente (YAGNI).

- [ ] **Step 3: Validar `reminder` no schema (com `leadMinutes`)**

Em `src/lib/validation.ts`, o campo `reminder` (já presente desde a Task 5) ganha `leadMinutes`:

```ts
  reminder: z
    .object({
      preset: z.enum(['agora', '30min', '1h', '1dia', 'custom']),
      customAt: z.string().datetime({ offset: true }).optional(),
      leadMinutes: z.number().int().min(0).max(1440).optional(), // antecedência do push (15/60/1440)
    })
    .nullable()
    .optional(),
```

> O preset da tarefa é persistido na coluna `reminderPreset` da `Task`; o lembrete concreto de cada ocorrência fica na tabela `Reminder` com `leadMinutes`.

- [ ] **Step 4: Integrar no POST /api/tasks (agenda lembrete) + GET `dia`**

Em `src/app/api/tasks/route.ts` (POST), após criar a `occurrence`:

```ts
  if (parsed.data.reminder?.preset) {
    const { createReminderForOccurrence } = await import('@/lib/reminders');
    await createReminderForOccurrence({
      taskId: task.id,
      occurrenceId: occurrence.id,
      dueAt: new Date(dueAt),
      preset: parsed.data.reminder.preset,
      customAt: parsed.data.reminder.customAt,
      leadMinutes: parsed.data.reminder.leadMinutes,
    });
  }
```

> O filtro `dia` do GET (usado pelo calendário) é implementado na Task 12b.

- [ ] **Step 5: Integrar no PATCH/DELETE (re-agenda; conclusão agenda o próximo)**

Em `src/app/api/tasks/[id]/route.ts`:

1. **DELETE** — antes de excluir, cancele agendamentos:

```ts
  const reminders = await prisma.reminder.findMany({
    where: { taskId: task.id, qstashScheduleId: { not: null } },
  });
  const { cancelScheduledReminder } = await import('@/lib/reminders');
  await Promise.allSettled(
    reminders.map((r) => (r.qstashScheduleId ? cancelScheduledReminder(r.qstashScheduleId) : Promise.resolve()))
  );
```

2. **Concluir (`done: true`)** — o preset da tarefa (`task.reminderPreset`, salvo no POST/edição) vale para a próxima ocorrência. No bloco `if (nextDueAt)`, a criação de `nextOcc` passa a agendar o lembrete da próxima. Substitua o bloco de Task 6:

```ts
        if (nextDueAt) {
          const nextOcc = await prisma.taskOccurrence.create({
            data: { taskId: task.id, dueAt: nextDueAt },
          });
          if (task.reminderPreset) {
            const { createReminderForOccurrence } = await import('@/lib/reminders');
            await createReminderForOccurrence({
              taskId: task.id,
              occurrenceId: nextOcc.id,
              dueAt: nextDueAt,
              preset: task.reminderPreset,
            });
          }
          next = {
            id: nextOcc.id,
            taskId: nextOcc.taskId,
            title: task.title,
            notes: task.notes,
            priority: task.priority,
            dueAt: nextOcc.dueAt.toISOString(),
            status: nextOcc.status,
            completedAt: null,
            rule: task.rule,
            ordem: task.ordem,
            subtasks: [],
            category: null,
          };
        }
```

3. **Editar (sem `done`)** — se `reminder` veio no body, salva o preset na tarefa, **cancela re-pushes** e cria o lembrete da próxima ocorrência pendente:

```ts
  if (fields.reminder?.preset) {
    const { createReminderForOccurrence, cancelScheduledReminder } = await import('@/lib/reminders');
    const activeOcc = await prisma.taskOccurrence.findFirst({
      where: { taskId: task.id, status: 'pendente' },
      orderBy: { dueAt: 'asc' },
    });
    if (activeOcc) {
      const existing = await prisma.reminder.findFirst({
        where: { taskId: task.id, occurrenceId: activeOcc.id, status: 'pendente' },
      });
      if (existing?.qstashScheduleId) await cancelScheduledReminder(existing.qstashScheduleId);
      await createReminderForOccurrence({
        taskId: task.id,
        occurrenceId: activeOcc.id,
        dueAt: activeOcc.dueAt,
        preset: fields.reminder.preset,
        customAt: fields.reminder.customAt,
        leadMinutes: fields.reminder.leadMinutes,
      });
    }
  }
```

> Se o `reminder` vier **null** (remover lembrete), cancele os pendentes e limpe o preset:

```ts
  if (fields.reminder === null) {
    const { cancelScheduledReminder } = await import('@/lib/reminders');
    const pendentes = await prisma.reminder.findMany({ where: { taskId: task.id, status: 'pendente' } });
    await Promise.allSettled(
      pendentes.map((r) => (r.qstashScheduleId ? cancelScheduledReminder(r.qstashScheduleId) : Promise.resolve()))
    );
    await prisma.reminder.updateMany({ where: { taskId: task.id, status: 'pendente' }, data: { status: 'falhou' } });
  }
```

- [ ] **Step 6: Rota trigger com verificação QStash + re-push**

`src/app/api/reminders/trigger/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';
import { prisma } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';
import { scheduleRepush } from '@/lib/reminders';

const REPUSH_INTERVAL_MIN = 10;
const REPUSH_MAX_PER_DAY = 30;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');
  if (!signature) return NextResponse.json({ error: 'sem assinatura' }, { status: 401 });

  const client = new Client({ token: process.env.QSTASH_TOKEN ?? '' });
  const valid = await client.verify({ signature, body: rawBody });
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
      await scheduleRepush(reminder.id, now);
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
      ...(nextRepushAt ? { qstashScheduleId: (await prisma.reminder.findUnique({ where: { id: reminder.id } }))?.qstashScheduleId } : {}),
    },
  });

  return NextResponse.json({ ok: true, sent: result.sent, nextRepushAt });
}
```

> **Nota de design:** a contagem `repushesToday` usa `remindAt >= início do dia` como teto aproximado — é a heurística de teto (30/dia) para não zumbir. O `qstashScheduleId` do re-push sobrescreve o anterior (o `scheduleRepush` chama `scheduleReminder` que retorna o novo id; o update acima o persiste). Se o SDK do QStash usar `qstash().schedules.create` de forma diferente, adapte apenas o SDK call.

- [ ] **Step 7: Testes de unidade (QStash mockado)**

`tests/reminders.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';

vi.mock('@upstash/qstash', () => {
  const schedules = {
    create: vi.fn().mockResolvedValue({ scheduleId: 'sch-1' }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
  return {
    Client: vi.fn().mockImplementation(() => ({
      schedules,
      verify: vi.fn().mockResolvedValue(true),
    })),
  };
});

import { createReminderForOccurrence } from '@/lib/reminders';
import { POST as trigger } from '@/app/api/reminders/trigger/route';

const userId = 'user-reminder';

beforeEach(async () => {
  await prisma.task.deleteMany({ where: { userId } });
});

afterEach(async () => {
  await prisma.task.deleteMany({ where: { userId } });
});

describe('createReminderForOccurrence', () => {
  it('cria lembrete pendente com schedule id', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Com lembrete' } });
    const occ = await prisma.taskOccurrence.create({
      data: { taskId: task.id, dueAt: new Date(Date.now() + 60 * 60 * 1000) },
    });

    await createReminderForOccurrence({
      taskId: task.id,
      occurrenceId: occ.id,
      dueAt: occ.dueAt,
      preset: '30min',
    });

    const reminder = await prisma.reminder.findFirst({ where: { taskId: task.id } });
    expect(reminder).not.toBeNull();
    expect(reminder!.qstashScheduleId).toBe('sch-1');
  });

  it('não agenda lembrete no passado', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Atrasado' } });
    const occ = await prisma.taskOccurrence.create({
      data: { taskId: task.id, dueAt: new Date(Date.now() - 1000) },
    });

    await createReminderForOccurrence({
      taskId: task.id,
      occurrenceId: occ.id,
      dueAt: occ.dueAt,
      preset: '30min',
    });

    const count = await prisma.reminder.count({ where: { taskId: task.id } });
    expect(count).toBe(0);
  });

  it('agenda push deslocado pela antecedência (leadMinutes)', async () => {
    const task = await prisma.task.create({ data: { userId, title: 'Com lead' } });
    const occ = await prisma.taskOccurrence.create({
      data: { taskId: task.id, dueAt: new Date(Date.now() + 2 * 60 * 60 * 1000) },
    });

    await createReminderForOccurrence({
      taskId: task.id,
      occurrenceId: occ.id,
      dueAt: occ.dueAt,
      preset: 'agora',
      leadMinutes: 15,
    });

    const reminder = await prisma.reminder.findFirst({ where: { taskId: task.id } });
    expect(reminder).not.toBeNull();
    expect(reminder!.leadMinutes).toBe(15);
  });
});

describe('trigger', () => {
  it('rejeita sem assinatura', async () => {
    const req = new Request('http://localhost/api/reminders/trigger', {
      method: 'POST',
      body: JSON.stringify({ reminderId: 'x' }),
    });
    const res = await trigger(req as never);
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 8: Rodar testes**

Run: `npx vitest run tests/reminder-rule.test.ts tests/reminders.test.ts`
Expected: 14 testes PASS (10 + 4). Ajuste o mock de `scheduleReminder` se o SDK do QStash exigir `qstash().schedules` — os nomes seguem a doc atual; se a assinatura real do SDK diferir, adapte **apenas o SDK call**, mantendo as interfaces `scheduleReminder`/`cancelScheduledReminder`/`scheduleRepush` estáveis.

- [ ] **Step 9: Commit**

```bash
git add src/lib/reminders.ts src/lib/reminder-rule.ts src/app/api/reminders tests/reminder-rule.test.ts tests/reminders.test.ts src/lib/validation.ts src/app/api/tasks && git commit -m "feat: lembretes com qstash + trigger com re-push"
```
