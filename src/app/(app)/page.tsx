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
            <TaskRow key={r.id} row={r} onToggle={onToggle} onIgnore={onIgnore} />
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
