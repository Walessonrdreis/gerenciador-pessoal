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
