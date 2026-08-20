# Task 8: Shell da interface — estilo Terminal, tela Hoje

**Files:**
- Create: `src/app/globals.css` (vars + base do tema)
- Create: `src/app/(app)/layout.tsx` (AppShell com status de sync)
- Create: `src/app/(app)/page.tsx` (tela Hoje)
- Create: `src/components/TaskRow.tsx` (com subtarefas expandíveis)
- Create: `src/components/SyncStatus.tsx`
- Create: `src/lib/api.ts` (client helpers)
- Create: `src/hooks/useTasks.ts` (com `ordem` e `subtasks` no tipo)

**Interfaces:**
- Consumes: `GET /api/tasks` (Task 5)
- Produces: `TaskRow` (props `row: TaskRowData`, `onToggle`) — reusado pelas telas Lista e Concluídas; `useTasks(filters)` → `{ rows, setRows, loading, error, refresh }`; `apiGet/apiPost/apiPatch/apiDelete` em `src/lib/api.ts`

- [ ] **Step 1: Tema global**

`src/app/globals.css`:

```css
:root {
  --bg: #0f1110;
  --fg: #e6e4dc;
  --dim: #6e736b;
  --accent: #7fd88f;
  --alert: #e5a050;
  --line: #262a26;
  --panel: #141714;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  padding: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: Consolas, Menlo, 'SF Mono', monospace;
  font-size: 14px;
  -webkit-tap-highlight-color: transparent;
}

button { font-family: inherit; }
input, textarea, select { font-family: inherit; color: var(--fg); background: var(--panel); border: 1px solid var(--line); padding: 10px 12px; font-size: 13px; width: 100%; }
input:focus, textarea:focus, select:focus { outline: 1px solid var(--accent); }
::placeholder { color: var(--dim); }

.app { max-width: 640px; margin: 0 auto; min-height: 100dvh; display: flex; flex-direction: column; }
.content { flex: 1; padding: 0 18px 96px; }

.nav { display: flex; gap: 18px; padding: 14px 18px; border-bottom: 1px dashed var(--line); position: sticky; top: 0; background: var(--bg); z-index: 10; }
.nav a { color: var(--dim); text-decoration: none; font-size: 11px; letter-spacing: .14em; text-transform: uppercase; }
.nav a.active { color: var(--accent); }
.nav a.active::before { content: '> '; }

.date-head { font-size: 30px; margin: 18px 0 2px; }
.date-head b { color: var(--accent); }
.sub { font-size: 11px; color: var(--dim); margin-bottom: 8px; }

.sec { font-size: 10px; letter-spacing: .16em; text-transform: uppercase; color: var(--accent); margin: 16px 0 4px; }
.sec.muted { color: var(--dim); }

.fab { position: fixed; bottom: 20px; right: max(18px, calc(50vw - 320px + 18px)); width: 52px; height: 52px; border-radius: 50%; background: var(--accent); color: var(--bg); border: none; font-size: 26px; font-weight: 700; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,.5); z-index: 20; }

.task { display: flex; gap: 10px; padding: 10px 0; border-bottom: 1px dashed var(--line); align-items: flex-start; }
.task .cb { background: none; border: none; color: var(--accent); font-size: 15px; cursor: pointer; padding: 0; width: auto; flex-shrink: 0; }
.task .tt { font-size: 14px; line-height: 1.35; }
.task .meta { font-size: 11px; color: var(--dim); margin-top: 2px; }
.task .prio-alta { color: var(--alert); }

.subtasks { margin: 6px 0 0; padding-left: 24px; }
.subtasks .sub { display: flex; gap: 8px; align-items: center; padding: 2px 0; }
.subtasks .sub .cb { font-size: 12px; }
.subtasks .sub .st { font-size: 12px; color: var(--fg); }
.subtasks .sub.done .st { color: var(--dim); text-decoration: line-through; }

.expand { background: none; border: none; color: var(--dim); cursor: pointer; padding: 0; width: auto; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }

.empty { color: var(--dim); font-size: 12px; padding: 24px 0; }
.error { color: var(--alert); font-size: 11px; padding: 8px 0; }
```

- [ ] **Step 2: Helpers de API + hook**

`src/lib/api.ts`:

```ts
export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function apiSend<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
}

export const apiPost = <T>(url: string, body: unknown) => apiSend<T>('POST', url, body);
export const apiPatch = <T>(url: string, body: unknown) => apiSend<T>('PATCH', url, body);
export const apiDelete = <T>(url: string, body?: unknown) => apiSend<T>('DELETE', url, body);
```

`src/hooks/useTasks.ts`:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

export interface SubtaskData {
  id: string;
  title: string;
  done: boolean;
  ordem: number;
}

export interface TaskRowData {
  id: string;
  taskId: string;
  title: string;
  notes: string | null;
  priority: string;
  dueAt: string;
  status: string;
  completedAt: string | null;
  rule: unknown;
  ordem: number;
  subtasks: SubtaskData[];
  category: { id: string; name: string; color: string } | null;
}

export function useTasks(params: string = '') {
  const [rows, setRows] = useState<TaskRowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await apiGet<TaskRowData[]>(`/api/tasks${params}`);
      setRows(data);
    } catch {
      setError('falha ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { rows, setRows, loading, error, refresh };
}
```

- [ ] **Step 3: SyncStatus + AppShell (4 abas)**

`src/components/SyncStatus.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

export default function SyncStatus() {
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const markSyncing = () => setSyncing(true);
    window.addEventListener('fetch', markSyncing);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.removeEventListener('fetch', markSyncing);
    };
  }, []);

  const text = !online ? 'offline' : syncing ? 'sincronizando…' : 'sincronizado';
  const color = !online ? 'var(--alert)' : syncing ? 'var(--fg)' : 'var(--dim)';
  return (
    <span style={{ color, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase' }}>{text}</span>
  );
}
```

`src/app/(app)/layout.tsx` (adiciona a 4ª aba `calendário`; `TaskForm`/`Fab` entram na Task 10):

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SyncStatus from '@/components/SyncStatus';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const tabs = [
    { href: '/', label: 'hoje' },
    { href: '/lista', label: 'lista' },
    { href: '/concluidas', label: 'concluídas' },
    { href: '/calendario', label: 'calendário' },
  ];

  return (
    <div className="app">
      <nav className="nav">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={pathname === t.href ? 'active' : ''}>
            {t.label}
          </Link>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <SyncStatus />
        </span>
      </nav>
      <main className="content">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: TaskRow com subtarefas expandíveis + ordem manual**

`src/components/TaskRow.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { apiPatch } from '@/lib/api';
import type { TaskRowData, SubtaskData } from '@/hooks/useTasks';

export default function TaskRow({
  row,
  onToggle,
}: {
  row: TaskRowData;
  onToggle: (row: TaskRowData) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subs, setSubs] = useState<SubtaskData[]>(row.subtasks ?? []);

  const meta = [
    row.dueAt ? new Date(row.dueAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '',
    row.priority === 'alta' ? '!alta' : '',
    row.category?.name ?? '',
  ]
    .filter(Boolean)
    .join(' · ');

  const toggleSub = async (sub: SubtaskData) => {
    setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, done: !s.done } : s)));
    try {
      await apiPatch(`/api/tasks/${row.taskId}/subtasks/${sub.id}`, { done: !sub.done });
    } catch {
      setSubs((prev) => prev.map((s) => (s.id === sub.id ? { ...s, done: sub.done } : s)));
    }
  };

  return (
    <div className="task" data-done={row.status === 'concluida'}>
      <button
        className="cb"
        onClick={() => onToggle(row)}
        aria-label={row.status === 'concluida' ? 'desfazer conclusão' : 'concluir'}
      >
        {row.status === 'concluida' ? '[x]' : '[ ]'}
      </button>
      <div style={{ flex: 1 }}>
        <div className="tt" style={row.status === 'concluida' ? { color: 'var(--dim)', textDecoration: 'line-through' } : undefined}>
          {row.title}
        </div>
        {row.notes ? <div className="meta">{row.notes}</div> : null}
        {meta ? <div className="meta">{meta}</div> : null}
        {subs.length > 0 && (
          <div className="subtasks">
            <button className="expand" onClick={() => setExpanded((e) => !e)}>
              {expanded ? '▾ ocultar itens' : `▸ itens (${subs.filter((s) => s.done).length}/${subs.length})`}
            </button>
            {expanded && subs.map((s) => (
              <div key={s.id} className={`sub${s.done ? ' done' : ''}`}>
                <button className="cb" onClick={() => toggleSub(s)} aria-label={s.done ? 'desfazer item' : 'concluir item'}>
                  {s.done ? '[x]' : '[ ]'}
                </button>
                <span className="st">{s.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Tela Hoje — ordem manual (prioridade é rótulo, não ordena)**

`src/app/(app)/page.tsx`:

```tsx
'use client';

import { useCallback, useState } from 'react';
import TaskRow from '@/components/TaskRow';
import { useTasks, type TaskRowData } from '@/hooks/useTasks';
import { apiPatch } from '@/lib/api';

function groupToday(rows: TaskRowData[]) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const overdue = rows.filter((r) => r.status === 'pendente' && new Date(r.dueAt) < startOfToday);
  const today = rows.filter((r) => {
    const d = new Date(r.dueAt);
    return r.status === 'pendente' && d >= startOfToday && d < new Date(startOfToday.getTime() + 86400000);
  });
  // ordem manual sempre: prioridade é rótulo, não ordena
  const sort = (a: TaskRowData, b: TaskRowData) => a.ordem - b.ordem;
  return { overdue: overdue.sort(sort), today: today.sort(sort) };
}

export default function Hoje() {
  const { rows, setRows, loading, error, refresh } = useTasks('?status=pendente');
  const [pendingId, setPendingId] = useState<string | null>(null);

  const onToggle = useCallback(
    async (row: TaskRowData) => {
      const prev = rows;
      // otimista: marca na hora, desfaz se a API falhar
      setRows((rs) =>
        rs.map((r) => (r.id === row.id ? { ...r, status: 'concluida', completedAt: new Date().toISOString() } : r))
      );
      setPendingId(row.id);
      try {
        const res = await apiPatch<{ next: { dueAt: string } | null }>(`/api/tasks/${row.taskId}`, {
          done: true,
          occurrenceId: row.id,
        });
        if (res.next) {
          const d = new Date(res.next.dueAt);
          console.log(`próxima: ${d.toLocaleDateString('pt-BR')}`);
        }
        refresh();
      } catch (e) {
        setRows(prev); // rollback otimista
        console.error(e);
      } finally {
        setPendingId(null);
      }
    },
    [rows, refresh]
  );

  const { overdue, today } = groupToday(rows);

  return (
    <>
      <div className="date-head">
        {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} <b>▮</b>
      </div>
      <div className="sub">
        {new Date().toLocaleDateString('pt-BR', { weekday: 'long' })} · {today.length + overdue.length} pendentes
      </div>

      {overdue.length > 0 && (
        <>
          <div className="sec">&gt; atrasadas ({overdue.length})</div>
          {overdue.map((r) => (
            <TaskRow key={r.id} row={r} onToggle={onToggle} />
          ))}
        </>
      )}

      <div className="sec">&gt; hoje ({today.length})</div>
      {today.map((r) => (
        <TaskRow key={r.id} row={r} onToggle={onToggle} />
      ))}

      {loading && <div className="empty">carregando…</div>}
      {!loading && today.length === 0 && overdue.length === 0 && (
        <div className="empty">nada para hoje. [ + ] para criar.</div>
      )}
      {error && <div className="error">[erro] {error}</div>}
      {pendingId && <div className="empty">sincronizando…</div>}
    </>
  );
}
```

- [ ] **Step 6: Rodar e testar manualmente**

Run: `npm run dev` → autenticado → tela Hoje renderiza tarefas (crie 1 pela API antes: `POST /api/tasks` via `! curl` ou pela próxima task). Estilo: fundo `#0F1110`, acentos verdes, checkbox `[ ]`, subtarefas expandíveis.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css src/app/\(app\) src/components/TaskRow.tsx src/components/SyncStatus.tsx src/lib/api.ts src/hooks && git commit -m "feat: shell terminal + tela hoje com subtarefas e ordem manual"
```
