# Task 9: Telas Lista e Concluídas + Calendário mensal de leitura

**Files:**
- Create: `src/app/(app)/lista/page.tsx`
- Create: `src/app/(app)/concluidas/page.tsx`
- Create: `src/app/(app)/calendario/page.tsx`

**Interfaces:**
- Consumes: `TaskRow`, `useTasks`, `apiPatch`, `apiGet` (Task 8); `GET /api/calendar` (Task 12) — a tela Calendário usa `useTasks` com `?status=todas` enquanto o endpoint dedicado não existe
- Produces: telas navegáveis pelas 4 abas; a Calendário agrupa por dia do mês e permite abrir o dia na Lista

- [ ] **Step 1: Tela Lista (busca + chips + agrupada por data, ordem manual)**

`src/app/(app)/lista/page.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import { useEffect } from 'react';
import TaskRow from '@/components/TaskRow';
import { useTasks, type TaskRowData } from '@/hooks/useTasks';
import { apiPatch, apiGet } from '@/lib/api';

export default function Lista() {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [prioridade, setPrioridade] = useState<string | null>(null);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);

  const qs = [
    'status=pendente',
    categoria ? `categoria=${categoria}` : '',
    prioridade ? `prioridade=${prioridade}` : '',
    busca ? `busca=${encodeURIComponent(busca)}` : '',
  ]
    .filter(Boolean)
    .join('&');

  const { rows, refresh } = useTasks(`?${qs}`);

  useEffect(() => {
    apiGet<{ id: string; name: string }[]>('/api/categories').then(setCats).catch(() => {});
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, TaskRowData[]>();
    for (const r of rows) {
      const day = new Date(r.dueAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'long' });
      const arr = map.get(day) ?? [];
      arr.push(r);
      map.set(day, arr);
    }
    // ordem manual dentro do grupo
    for (const [, arr] of map) arr.sort((a, b) => a.ordem - b.ordem);
    return [...map.entries()];
  }, [rows]);

  const onToggle = async (row: TaskRowData) => {
    try {
      await apiPatch(`/api/tasks/${row.taskId}`, { done: true, occurrenceId: row.id });
      refresh();
    } catch (e) {
      console.error(e);
    }
  };

  const chip = (label: string, active: boolean, onClick: () => void) => (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
        color: active ? 'var(--accent)' : 'var(--dim)',
        background: 'transparent',
        padding: '5px 10px',
        fontSize: 10,
        letterSpacing: '.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  );

  return (
    <>
      <div className="date-head">
        lista <b>▮</b>
      </div>
      <input placeholder="> buscar: _" value={busca} onChange={(e) => setBusca(e.target.value)} style={{ marginTop: 10 }} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
        {chip('todas', categoria === null && prioridade === null, () => { setCategoria(null); setPrioridade(null); })}
        {cats.map((c) => chip(`[${c.name}]`, categoria === c.id, () => setCategoria(categoria === c.id ? null : c.id)))}
        {chip('!alta', prioridade === 'alta', () => setPrioridade(prioridade === 'alta' ? null : 'alta'))}
      </div>

      {grouped.map(([day, dayRows]) => (
        <div key={day}>
          <div className="sec muted">{day} ({dayRows.length})</div>
          {dayRows.map((r) => (
            <TaskRow key={r.id} row={r} onToggle={onToggle} />
          ))}
        </div>
      ))}
      {!rows.length && <div className="empty">nenhuma tarefa pendente.</div>}
    </>
  );
}
```

- [ ] **Step 2: Tela Concluídas (com subtarefas riscadas)**

`src/app/(app)/concluidas/page.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import TaskRow from '@/components/TaskRow';
import { useTasks, type TaskRowData } from '@/hooks/useTasks';
import { apiPatch } from '@/lib/api';

export default function Concluidas() {
  const { rows, refresh } = useTasks('?status=concluida');

  const byDay = useMemo(() => {
    const map = new Map<string, TaskRowData[]>();
    for (const r of rows) {
      const key = r.completedAt
        ? new Date(r.completedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', weekday: 'long' })
        : 'outros';
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    for (const [, arr] of map) arr.sort((a, b) => a.ordem - b.ordem);
    return [...map.entries()];
  }, [rows]);

  const onUndo = async (row: TaskRowData) => {
    try {
      await apiPatch(`/api/tasks/${row.taskId}`, { done: false, occurrenceId: row.id });
      refresh();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <div className="date-head">
        concluídas <b>▮</b>
      </div>
      {byDay.map(([day, dayRows]) => (
        <div key={day}>
          <div className="sec muted">{day} ({dayRows.length})</div>
          {dayRows.map((r) => (
            <TaskRow key={r.id} row={r} onToggle={onUndo} />
          ))}
        </div>
      ))}
      {!rows.length && <div className="empty">nada concluído ainda.</div>}
    </>
  );
}
```

- [ ] **Step 3: Tela Calendário (grade mensal de leitura)**

`src/app/(app)/calendario/page.tsx`:

```tsx
'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTasks } from '@/hooks/useTasks';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function Calendario() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });
  const { rows } = useTasks('?status=todas');

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const d = new Date(r.dueAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const primeiro = new Date(cursor.ano, cursor.mes, 1);
  const primeiroDiaSemana = primeiro.getDay(); // 0 = domingo
  const diasNoMes = new Date(cursor.ano, cursor.mes + 1, 0).getDate();
  const hoje = new Date();
  const hojeKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

  const cells: (string | null)[] = [];
  for (let i = 0; i < primeiroDiaSemana; i++) cells.push(null);
  for (let dia = 1; dia <= diasNoMes; dia++) {
    cells.push(`${cursor.ano}-${String(cursor.mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`);
  }

  const mudarMes = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.ano, c.mes + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  };

  return (
    <>
      <div className="date-head">
        calendário <b>▮</b>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0' }}>
        <button onClick={() => mudarMes(-1)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 16, padding: 0, width: 'auto' }}>
          &lt;
        </button>
        <span style={{ fontSize: 14, letterSpacing: '.1em', textTransform: 'uppercase' }}>
          {MESES[cursor.mes]} {cursor.ano}
        </span>
        <button onClick={() => mudarMes(1)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 16, padding: 0, width: 'auto' }}>
          &gt;
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {DIAS.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em' }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((key, i) =>
          key === null ? (
            <div key={`vazio-${i}`} style={{ aspectRatio: '1', border: '1px dashed transparent' }} />
          ) : (
            <Link
              key={key}
              href={`/lista?dia=${key}`}
              style={{
                aspectRatio: '1',
                border: '1px solid var(--line)',
                color: key === hojeKey ? 'var(--accent)' : 'var(--fg)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                background: key === hojeKey ? 'rgba(127,216,143,.08)' : 'transparent',
              }}
            >
              <span>
                {Number(key.slice(-2))}
                {byDay.has(key) && <span style={{ color: 'var(--accent)' }}> ·{byDay.get(key)}</span>}
              </span>
            </Link>
          )
        )}
      </div>

      <div className="sub" style={{ marginTop: 12 }}>
        toque num dia para ver as tarefas na lista
      </div>
    </>
  );
}
```

> **Nota:** o link `/lista?dia=YYYY-MM-DD` abre a Lista; a Lista ignora o parâmetro `dia` nesta task. O filtro por dia do calendário (mostrar só as tarefas daquele dia) é um refinamento pequeno — implemente-o no Step 4 (a Lista lê `dia` do `useSearchParams` e passa `&busca=`/filtro de data quando presente). O endpoint dedicado `GET /api/calendar` fica na Task 12; a tela usa `useTasks` com `?status=todas` até lá.

- [ ] **Step 4 (opcional): Lista filtra pelo dia vindo do calendário**

Modifique `src/app/(app)/lista/page.tsx` para ler `dia` de `useSearchParams` e, quando presente, agrupar só as ocorrências daquele dia:

```tsx
import { useSearchParams } from 'next/navigation';
// dentro do componente:
const searchParams = useSearchParams();
const dia = searchParams.get('dia');
// no uso de useTasks:
const { rows, refresh } = useTasks(`?${dia ? `dia=${dia}` : qs}`);
```

> A API `GET /api/tasks` ainda não aceita `dia` — o parâmetro extra é ignorado silenciosamente. Para o filtro funcionar, a Task 12 adiciona `dia=YYYY-MM-DD` ao `GET /api/tasks` (filtra ocorrências com `dueAt` naquele dia). Implemente o `dia` na API na Task 12 e o consumo aqui (o link do calendário já funciona como navegação).

- [ ] **Step 5: Rodar e testar manualmente**

Run: `npm run dev` → navegue pelas 4 abas; conclua na Hoje → aparece em Concluídas; desfaça → volta; calendário mostra contagem por dia e navega meses.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/lista src/app/\(app\)/concluidas src/app/\(app\)/calendario && git commit -m "feat: telas lista, concluídas e calendário mensal"
```
