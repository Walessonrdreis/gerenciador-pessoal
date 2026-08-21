'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Reordenar arrastando via Pointer Events (funciona com mouse E touch —
 * o HTML5 drag-and-drop nativo (`draggable`) não dispara em telas touch).
 *
 * Uso: cada item pega `setRowRef(id)` no elemento da linha e os handlers
 * de `handleProps(id)` na alça de arrastar. Ao soltar, `onCommit` recebe a
 * lista de ids na nova ordem.
 */
export function usePointerReorder(itemIds: string[], onCommit: (orderedIds: string[]) => void) {
  const [order, setOrder] = useState<string[] | null>(null);
  const draggingId = useRef<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const [draggingState, setDraggingState] = useState<string | null>(null);

  const setRowRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) rowRefs.current.set(id, el);
      else rowRefs.current.delete(id);
    },
    []
  );

  const currentOrder = useCallback(() => order ?? itemIds, [order, itemIds]);

  const onPointerDown = useCallback(
    (id: string) => (e: React.PointerEvent) => {
      e.preventDefault();
      draggingId.current = id;
      setDraggingState(id);
      setOrder(currentOrder());
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [currentOrder]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!draggingId.current) return;
    const y = e.clientY;
    let closestId: string | null = null;
    let closestDist = Infinity;
    for (const [id, el] of rowRefs.current) {
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const dist = Math.abs(mid - y);
      if (dist < closestDist) {
        closestDist = dist;
        closestId = id;
      }
    }
    if (closestId && closestId !== draggingId.current) {
      const dragged = draggingId.current;
      setOrder((prev) => {
        const cur = prev ?? currentOrder();
        const from = cur.indexOf(dragged);
        const to = cur.indexOf(closestId!);
        if (from === -1 || to === -1) return cur;
        const next = [...cur];
        next.splice(from, 1);
        next.splice(to, 0, dragged);
        return next;
      });
    }
  }, [currentOrder]);

  const onPointerUp = useCallback(() => {
    if (!draggingId.current) return;
    draggingId.current = null;
    setDraggingState(null);
    setOrder((finalOrder) => {
      if (finalOrder) onCommit(finalOrder);
      return null; // volta a refletir a ordem "canônica" (props) até o próximo refresh
    });
  }, [onCommit]);

  const displayOrder = order ?? itemIds;

  const handleProps = (id: string) => ({
    onPointerDown: onPointerDown(id),
    onPointerMove,
    onPointerUp,
    onPointerCancel: onPointerUp,
  });

  return { displayOrder, setRowRef, handleProps, isDragging: (id: string) => draggingState === id };
}
