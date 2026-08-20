# Task 12b: Resumo diário (cron) + endpoint calendário

**Files:**
- Create: `src/app/api/reminders/daily-digest/route.ts`
- Create: `src/app/api/calendar/route.ts`
- Modify: `src/app/api/tasks/route.ts` (GET aceita `dia` — usado pelo calendário)

**Interfaces:**
- Consumes: `sendPushToUser` (Task 11), `prisma`
- Produces:
  - `POST /api/reminders/daily-digest` (cron QStash; valida assinatura; envia 1 push resumo com as pendentes do dia)
  - `GET /api/calendar?month=YYYY-MM` → `{ [dia]: { count, tasks: TaskRow[] } }`
  - `GET /api/tasks?dia=YYYY-MM-DD` → filtra ocorrências daquele dia (usado pela Lista ao receber o link do calendário)

- [ ] **Step 1: Rota do resumo diário**

`src/app/api/reminders/daily-digest/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@upstash/qstash';
import { prisma } from '@/lib/db';
import { sendPushToUser } from '@/lib/push';

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('upstash-signature');
  if (!signature) return NextResponse.json({ error: 'sem assinatura' }, { status: 401 });

  const client = new Client({ token: process.env.QSTASH_TOKEN ?? '' });
  const valid = await client.verify({ signature, body: rawBody });
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
  const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
```

> **Cron:** crie no QStash um cron diário (ex.: 7h horário local) que chama `POST /api/reminders/daily-digest` com body `{ userId }` — um cron **por usuário** (o cron fixo não itera usuários). Para v1, configure manualmente no painel da Upstash para cada usuário; a automatização (criar/remover cron por usuário ao login/deslogar) fica como melhoria.

- [ ] **Step 2: Endpoint do calendário**

`src/app/api/calendar/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getAuthUserId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const userId = await getAuthUserId();
  if (!userId) return NextResponse.json({ error: 'não autenticado' }, { status: 401 });

  const month = req.nextUrl.searchParams.get('month'); // YYYY-MM
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: 'month deve ser YYYY-MM' }, { status: 400 });
  }
  const [ano, mes] = month.split('-').map(Number);
  const start = new Date(Date.UTC(ano, mes - 1, 1));
  const end = new Date(Date.UTC(ano, mes, 1));

  const occurrences = await prisma.taskOccurrence.findMany({
    where: {
      task: { userId },
      dueAt: { gte: start, lt: end },
    },
    include: {
      task: {
        include: {
          category: { select: { id: true, name: true, color: true } },
          subtasks: { orderBy: { ordem: 'asc' } },
        },
      },
    },
    orderBy: { dueAt: 'asc' },
  });

  const byDay: Record<string, { count: number; tasks: unknown[] }> = {};
  for (const o of occurrences) {
    const key = `${o.dueAt.getUTCFullYear()}-${String(o.dueAt.getUTCMonth() + 1).padStart(2, '0')}-${String(o.dueAt.getUTCDate()).padStart(2, '0')}`;
    const row = {
      id: o.id,
      taskId: o.taskId,
      title: o.task.title,
      notes: o.task.notes,
      priority: o.task.priority,
      dueAt: o.dueAt.toISOString(),
      status: o.status,
      completedAt: o.completedAt?.toISOString() ?? null,
      rule: o.task.rule,
      ordem: o.task.ordem,
      subtasks: o.task.subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done, ordem: s.ordem })),
      category: o.task.category,
    };
    if (!byDay[key]) byDay[key] = { count: 0, tasks: [] };
    byDay[key].count += 1;
    byDay[key].tasks.push(row);
  }

  return NextResponse.json(byDay);
}
```

> **Nota:** a tela Calendário (Task 9) usa `useTasks('?status=todas')` — o endpoint `GET /api/calendar` fica disponível para quem preferir consulta dedicada; a Task 9 já cobre a contagem por dia com o `useTasks`.

- [ ] **Step 3: GET /api/tasks aceita `dia` (filtro do calendário)**

Em `src/app/api/tasks/route.ts` (GET), após `const busca = ...`:

```ts
  const dia = params.get('dia'); // YYYY-MM-DD (do calendário)
```

E no `where` das ocorrências (dentro do objeto de `where` de `taskOccurrence`):

```ts
      ...(dia
        ? {
            dueAt: {
              gte: new Date(`${dia}T00:00:00.000Z`),
              lt: new Date(`${dia}T23:59:59.999Z`),
            },
          }
        : {}),
```

> Com isso, o link `/lista?dia=YYYY-MM-DD` do calendário (Task 9) filtra as tarefas do dia.

- [ ] **Step 4: Rodar e verificar**

Run: `npx vitest run tests/reminder-rule.test.ts tests/reminders.test.ts` (ainda passam — a rota do resumo não muda o trigger).
Expected: testes verdes. Teste manual do calendário: `npm run dev` → aba calendário → toque num dia → Lista mostra só as tarefas daquele dia.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/reminders/daily-digest src/app/api/calendar src/app/api/tasks/route.ts && git commit -m "feat: resumo diário (cron) + endpoint calendário + filtro por dia"
```
