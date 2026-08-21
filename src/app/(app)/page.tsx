'use client';

import { useCallback, useRef, useState } from 'react';
import TaskRow from '@/components/TaskRow';
import { useTasks, type TaskRowData } from '@/hooks/useTasks';
import { apiPatch, apiPost } from '@/lib/api';

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

  // arrastar pra reordenar (ordem manual): grupo = 'atrasadas' | 'hoje' — a
  // ordem só é comparável dentro do mesmo grupo. Pointer events (não HTML5
  // drag nativo — este não dispara em touch/celular).
  const [orderOverride, setOrderOverride] = useState<Record<string, string[]>>({});
  const [dragging, setDragging] = useState<{ group: string; id: string } | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const setRowRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };

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

  const onIgnore = useCallback(
    async (row: TaskRowData) => {
      try {
        await apiPatch(`/api/tasks/${row.taskId}`, { ignored: true, occurrenceId: row.id });
        refresh();
      } catch (e) {
        console.error(e);
      }
    },
    [refresh]
  );

  const { overdue, today } = groupToday(rows);
  const groups: Record<string, TaskRowData[]> = { overdue, today };

  const ordered = (group: string, list: TaskRowData[]) => {
    const override = orderOverride[group];
    if (!override) return list;
    return [...list].sort((a, b) => override.indexOf(a.id) - override.indexOf(b.id));
  };

  const onPointerDownRow = (group: string, id: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    setDragging({ group, id });
    setOrderOverride((prev) => (prev[group] ? prev : { ...prev, [group]: groups[group].map((r) => r.id) }));
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMoveRow = (group: string) => (e: React.PointerEvent) => {
    if (!dragging || dragging.group !== group) return;
    const groupIds = new Set(groups[group].map((r) => r.id));
    const y = e.clientY;
    let closestId: string | null = null;
    let closestDist = Infinity;
    for (const [id, el] of rowRefs.current) {
      if (!groupIds.has(id)) continue;
      const rect = el.getBoundingClientRect();
      const dist = Math.abs(rect.top + rect.height / 2 - y);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }
    if (closestId && closestId !== dragging.id) {
      setOrderOverride((prev) => {
        const current = prev[group] ?? [];
        const from = current.indexOf(dragging.id);
        const to = current.indexOf(closestId!);
        if (from === -1 || to === -1) return prev;
        const next = [...current];
        next.splice(from, 1);
        next.splice(to, 0, dragging.id);
        return { ...prev, [group]: next };
      });
    }
  };

  const onPointerUpRow = (group: string) => async () => {
    const order = orderOverride[group];
    setDragging(null);
    if (!order) return;
    const byId = new Map(groups[group].map((r) => [r.id, r]));
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
        delete rest[group];
        return rest;
      });
      refresh();
    }
  };

  const dragHandle = (group: string, id: string) => ({
    setRef: setRowRef(id),
    onPointerDown: onPointerDownRow(group, id),
    onPointerMove: onPointerMoveRow(group),
    onPointerUp: onPointerUpRow(group),
    onPointerCancel: onPointerUpRow(group),
    dragging: dragging?.id === id,
  });

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
          {ordered('overdue', overdue).map((r) => (
            <TaskRow key={r.id} row={r} onToggle={onToggle} onIgnore={onIgnore} dragHandle={dragHandle('overdue', r.id)} />
          ))}
        </>
      )}

      <div className="sec">&gt; hoje ({today.length})</div>
      {ordered('today', today).map((r) => (
        <TaskRow key={r.id} row={r} onToggle={onToggle} onIgnore={onIgnore} dragHandle={dragHandle('today', r.id)} />
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
