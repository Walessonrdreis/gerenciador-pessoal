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
