'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SyncStatus from '@/components/SyncStatus';
import Fab from '@/components/Fab';
import TaskForm from '@/components/TaskForm';
import NotificationGate from '@/components/NotificationGate';
import InstallPrompt from '@/components/InstallPrompt';
import { TaskEditorContext } from '@/lib/task-editor-context';
import type { TaskRowData } from '@/hooks/useTasks';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskRowData | null>(null);

  const openEdit = (row: TaskRowData) => {
    setEditingTask(row);
    setFormOpen(true);
  };

  const tabs = [
    { href: '/', label: 'hoje' },
    { href: '/lista', label: 'lista' },
    { href: '/concluidas', label: 'concluídas' },
    { href: '/calendario', label: 'calendário' },
  ];

  return (
    <TaskEditorContext.Provider value={openEdit}>
      <div className="app">
        <nav className="nav">
          {tabs.map((t) => (
            <Link key={t.href} href={t.href} className={pathname === t.href ? 'active' : ''}>
              {t.label}
            </Link>
          ))}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
            <SyncStatus />
          </span>
        </nav>
        <main className="content">
          {children}
          <NotificationGate />
          <InstallPrompt />
        </main>
        <Fab onClick={() => { setEditingTask(null); setFormOpen(true); }} />
        <TaskForm
          open={formOpen}
          task={editingTask}
          onClose={() => setFormOpen(false)}
          onCreated={() => window.location.reload()}
        />
      </div>
    </TaskEditorContext.Provider>
  );
}
