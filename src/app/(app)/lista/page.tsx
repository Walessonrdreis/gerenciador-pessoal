'use client';

import { Suspense, useMemo, useState } from 'react';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import TaskRow from '@/components/TaskRow';
import { useTasks, type TaskRowData } from '@/hooks/useTasks';
import { apiPatch, apiGet } from '@/lib/api';

export default function Lista() {
  return (
    <Suspense>
      <ListaContent />
    </Suspense>
  );
}

function ListaContent() {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [prioridade, setPrioridade] = useState<string | null>(null);
  const [cats, setCats] = useState<{ id: string; name: string }[]>([]);

  // o calendário chega em /lista?dia=YYYY-MM-DD; a API já filtra por `dia`
  const dia = useSearchParams().get('dia');

  const qs = [
    'status=pendente',
    dia ? `dia=${dia}` : '',
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
    // agrupado por data de vencimento — arrastar pra reordenar não faz sentido
    // aqui (a ordem manual é usada na tela Hoje); aqui ordena pelo horário
    for (const [, arr] of map) arr.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
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

  const onIgnore = async (row: TaskRowData) => {
    try {
      await apiPatch(`/api/tasks/${row.taskId}`, { ignored: true, occurrenceId: row.id });
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
            <TaskRow key={r.id} row={r} onToggle={onToggle} onIgnore={onIgnore} />
          ))}
        </div>
      ))}
      {!rows.length && <div className="empty">nenhuma tarefa pendente.</div>}
    </>
  );
}
