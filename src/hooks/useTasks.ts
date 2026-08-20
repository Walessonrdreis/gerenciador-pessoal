'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';

export interface SubtaskData {
  id: string;
  title: string;
  done: boolean;
  ordem: number;
}

export interface TaskRowData {
  id: string;
  taskId: string;
  title: string;
  notes: string | null;
  priority: string;
  dueAt: string;
  status: string;
  completedAt: string | null;
  rule: unknown;
  ordem: number;
  subtasks: SubtaskData[];
  category: { id: string; name: string; color: string } | null;
}

export function useTasks(params: string = '') {
  const [rows, setRows] = useState<TaskRowData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const data = await apiGet<TaskRowData[]>(`/api/tasks${params}`);
      setRows(data);
    } catch {
      setError('falha ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => {
    setLoading(true);
    refresh();
  }, [refresh]);

  return { rows, setRows, loading, error, refresh };
}
