'use client';

import { useEffect, useState } from 'react';
import { apiPatch } from '@/lib/api';
import type { TaskRowData, SubtaskData } from '@/hooks/useTasks';
import { useTaskEditor } from '@/lib/task-editor-context';
import { usePointerReorder } from '@/hooks/usePointerReorder';

export interface TaskDragHandle {
  setRef: (el: HTMLElement | null) => void;
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  dragging: boolean;
}

export default function TaskRow({
  row,
  onToggle,
  onIgnore,
  dragHandle,
}: {
  row: TaskRowData;
  onToggle: (row: TaskRowData) => void;
  /** omitido = sem ação de ignorar (ex.: tela de Concluídas) */
  onIgnore?: (row: TaskRowData) => void;
  /** presente = mostra alça de arrastar pra reordenar a tarefa (a lista de fora controla o estado) */
  dragHandle?: TaskDragHandle;
}) {
  const [expanded, setExpanded] = useState(false);
  const [subs, setSubs] = useState<SubtaskData[]>(row.subtasks ?? []);
  const openEdit = useTaskEditor();

  useEffect(() => setSubs(row.subtasks ?? []), [row.subtasks]);

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

  // reordenar subtarefas dentro do checklist (independente da ordem das tarefas)
  const subReorder = usePointerReorder(
    subs.map((s) => s.id),
    async (orderedIds) => {
      setSubs((prev) => orderedIds.map((id) => prev.find((s) => s.id === id)!).filter(Boolean));
      try {
        await Promise.all(
          orderedIds.map((id, i) => apiPatch(`/api/tasks/${row.taskId}/subtasks/${id}`, { ordem: i }))
        );
      } catch (e) {
        console.error(e);
      }
    }
  );
  const orderedSubs = subReorder.displayOrder.map((id) => subs.find((s) => s.id === id)).filter((s): s is SubtaskData => Boolean(s));

  return (
    <div className="task" data-done={row.status === 'concluida'} ref={dragHandle?.setRef}>
      {dragHandle && (
        <button
          className="cb"
          style={{ cursor: 'grab', touchAction: 'none', opacity: dragHandle.dragging ? 1 : 0.6 }}
          onPointerDown={dragHandle.onPointerDown}
          onPointerMove={dragHandle.onPointerMove}
          onPointerUp={dragHandle.onPointerUp}
          onPointerCancel={dragHandle.onPointerCancel}
          aria-label="arrastar para reordenar"
        >
          ⠿
        </button>
      )}
      <button
        className="cb"
        onClick={() => onToggle(row)}
        aria-label={row.status === 'concluida' ? 'desfazer conclusão' : 'concluir'}
      >
        {row.status === 'concluida' ? '[x]' : '[ ]'}
      </button>
      <div style={{ flex: 1 }}>
        <div
          className="tt"
          onClick={() => openEdit(row)}
          style={{
            cursor: 'pointer',
            ...(row.status === 'concluida' ? { color: 'var(--dim)', textDecoration: 'line-through' } : {}),
          }}
        >
          {row.title}
        </div>
        {row.notes ? <div className="meta">{row.notes}</div> : null}
        {meta ? <div className="meta">{meta}</div> : null}
        {subs.length > 0 && (
          <div className="subtasks">
            <button className="expand" onClick={() => setExpanded((e) => !e)}>
              {expanded ? '▾ ocultar itens' : `▸ itens (${subs.filter((s) => s.done).length}/${subs.length})`}
            </button>
            {expanded && orderedSubs.map((s) => (
              <div key={s.id} className={`sub${s.done ? ' done' : ''}`} ref={subReorder.setRowRef(s.id)} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  className="cb"
                  style={{ cursor: 'grab', touchAction: 'none', opacity: subReorder.isDragging(s.id) ? 1 : 0.5 }}
                  {...subReorder.handleProps(s.id)}
                  aria-label="arrastar item para reordenar"
                >
                  ⠿
                </button>
                <button className="cb" onClick={() => toggleSub(s)} aria-label={s.done ? 'desfazer item' : 'concluir item'}>
                  {s.done ? '[x]' : '[ ]'}
                </button>
                <span className="st">{s.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      {onIgnore && row.status === 'pendente' && (
        <button
          className="expand"
          onClick={() => onIgnore(row)}
          style={{ alignSelf: 'flex-start' }}
          aria-label="ignorar"
          title="ignorar (some da lista sem concluir)"
        >
          ignorar
        </button>
      )}
    </div>
  );
}
