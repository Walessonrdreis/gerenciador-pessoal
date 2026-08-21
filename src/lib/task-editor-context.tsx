'use client';

import { createContext, useContext } from 'react';
import type { TaskRowData } from '@/hooks/useTasks';

// Compartilha o "abrir form de edição" entre as telas (Hoje/Lista/Concluídas)
// e o TaskForm montado uma única vez no layout — evita duplicar o modal por página.
export const TaskEditorContext = createContext<(row: TaskRowData) => void>(() => {});

export function useTaskEditor() {
  return useContext(TaskEditorContext);
}
