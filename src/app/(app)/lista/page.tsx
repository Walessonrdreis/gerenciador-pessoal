'use client';

import { Suspense, useMemo, useRef, useState } from 'react';
import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import TaskRow from '@/components/TaskRow';
import { useTasks, type TaskRowData } from '@/hooks/useTasks';
import { apiPatch, apiGet, apiPost } from '@/lib/api';

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
  // reordenar arrastando: override local por dia (id da ocorrência, em ordem de exibição)
  // até persistir no servidor — depois disso o `refresh()` traz a ordem canônica.
  const [orderOverride, setOrderOverride] = useState<Record<string, string[]>>({});
  const [dragging, setDragging] = useState<{ day: string; id: string } | null>(null);
  // usa pointer events (não HTML5 drag nativo — este não dispara em touch/celular)
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const setRowRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };

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
    // ordem manual dentro do grupo (override local durante o arrasto, senão `ordem` do servidor)
    for (const [day, arr] of map) {
      const override = orderOverride[day];
      if (override) {
        arr.sort((a, b) => override.indexOf(a.id) - override.indexOf(b.id));
      } else {
        arr.sort((a, b) => a.ordem - b.ordem);
      }
    }
    return [...map.entries()];
  }, [rows, orderOverride]);

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

  const onPointerDownRow = (day: string, dayRows: TaskRowData[], id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging({ day, id });
    setOrderOverride((prev) => (prev[day] ? prev : { ...prev, [day]: dayRows.map((r) => r.id) }));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMoveRow = (day: string, dayRows: TaskRowData[]) => (e: React.PointerEvent) => {
    if (!dragging || dragging.day !== day) return;
    const dayIds = new Set(dayRows.map((r) => r.id));
    const y = e.clientY;
    let closestId: string | null = null;
    let closestDist = Infinity;
    for (const [id, el] of rowRefs.current) {
      if (!dayIds.has(id)) continue; // só linhas do mesmo dia
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - y);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }
    if (closestId && closestId !== dragging.id) {
      setOrderOverride((prev) => {
        const current = prev[day] ?? [];
        const from = current.indexOf(dragging.id);
        const to = current.indexOf(closestId!);
        if (from === -1 || to === -1) return prev;
        const next = [...current];
        next.splice(from, 1);
        next.splice(to, 0, dragging.id);
        return { ...prev, [day]: next };
      });
    }
  };

  const onPointerUpRow = (day: string, dayRows: TaskRowData[]) => async () => {
    const order = orderOverride[day];
    setDragging(null);
    if (!order) return;
    const byId = new Map(dayRows.map((r) => [r.id, r]));
    const payload = order
      .map((id, i) => {
        const row = byId.get(id);
        return row ? { taskId: row.taskId, ordem: i } : null;
      })
      .filter((x): x is { taskId: string; ordem: number } => x !== null);
    try {
      await apiPost('/api/tasks/reorder', payload);
    } catch (e) {
      console.error(e);
    } finally {
      setOrderOverride((prev) => {
        const rest = { ...prev };
        delete rest[day];
        return rest;
      });
      refresh();
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
            <TaskRow
              key={r.id}
              row={r}
              onToggle={onToggle}
              onIgnore={onIgnore}
              dragHandle={{
                setRef: setRowRef(r.id),
                onPointerDown: onPointerDownRow(day, dayRows, r.id),
                onPointerMove: onPointerMoveRow(day, dayRows),
                onPointerUp: onPointerUpRow(day, dayRows),
                onPointerCancel: onPointerUpRow(day, dayRows),
                dragging: dragging?.id === r.id,
              }}
            />
          ))}
        </div>
      ))}
      {!rows.length && <div className="empty">nenhuma tarefa pendente.</div>}
    </>
  );
}
