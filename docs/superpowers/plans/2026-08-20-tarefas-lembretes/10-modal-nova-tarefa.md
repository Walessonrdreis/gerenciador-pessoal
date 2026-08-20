# Task 10: Modal de nova tarefa (bottom sheet) — subtarefas, modelos, multi-dia, antecedência

**Files:**
- Create: `src/components/TaskForm.tsx`
- Create: `src/components/Fab.tsx`
- Modify: `src/app/(app)/layout.tsx` (adicionar Fab e TaskForm)

**Interfaces:**
- Consumes: `apiPost` (Task 8), `apiGet` para categorias/modelos, `POST /api/templates/:id/apply` (Task 7)
- Produces: `TaskForm({ open, onClose, onCreated })` — sheet com campos título, notas, prioridade, categoria, data/hora, recorrência (frequência + **dias da semana** + intervalo + fim), **lista de subtarefas**, **seletor de modelo**, **lembrete com antecedência**; `Fab()` — botão `+` verde que abre o sheet

- [ ] **Step 1: Escrever o componente**

`src/components/TaskForm.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPost } from '@/lib/api';

interface Category { id: string; name: string; color: string }
interface Template { id: string; name: string; subtasks: { titulo: string; ordem: number }[] | null; priority: string; categoryId: string | null; reminderPreset: string | null }
interface SubInput { title: string }

export default function TaskForm({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [cats, setCats] = useState<Category[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<'alta' | 'media' | 'baixa'>('media');
  const [categoryId, setCategoryId] = useState('');
  const [dueAt, setDueAt] = useState<string>('');
  const [freq, setFreq] = useState<'daily' | 'weekly' | 'monthly' | 'yearly' | ''>('');
  const [days, setDays] = useState<number[]>([]);
  const [interval_, setInterval_] = useState(1);
  const [endDate, setEndDate] = useState('');
  const [reminder, setReminder] = useState('30min');
  const [subs, setSubs] = useState<SubInput[]>([]);
  const [subInput, setSubInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    const d = new Date(Date.now() + 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    setDueAt(d.toISOString().slice(0, 16));
    setSubs([]);
    setSubInput('');
    apiGet<Category[]>('/api/categories').then(setCats).catch(() => {});
    apiGet<Template[]>('/api/templates').then(setTemplates).catch(() => {});
  }, [open]);

  if (!open) return null;

  const applyTemplate = (t: Template) => {
    setTitle(t.name);
    setPriority(t.priority as 'alta' | 'media' | 'baixa');
    if (t.categoryId) setCategoryId(t.categoryId);
    if (t.reminderPreset) setReminder(t.reminderPreset);
    setSubs((t.subtasks ?? []).map((s) => ({ title: s.titulo })));
  };

  const addSub = () => {
    const v = subInput.trim();
    if (!v) return;
    setSubs((prev) => [...prev, { title: v }]);
    setSubInput('');
  };

  const toggleDay = (d: number) =>
    setDays((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()));

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        title,
        notes: notes || null,
        priority,
        dueAt: new Date(dueAt).toISOString(),
        ...(categoryId ? { categoryId } : {}),
        ...(freq ? { rule: { frequency: freq, interval: interval_, ...(freq === 'weekly' && days.length ? { daysOfWeek: days } : {}), ...(endDate ? { endDate: new Date(endDate).toISOString() } : {}) } } : {}),
        subtasks: subs.map((s) => ({ title: s.title })),
        reminder: { preset: reminder },
      };
      await apiPost('/api/tasks', body);
      onCreated();
      onClose();
    } catch (e) {
      setError('não foi possível salvar');
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: 'var(--dim)', fontSize: 9, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );

  const dias = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(5,6,5,.82)', display: 'flex', alignItems: 'flex-end', zIndex: 100, backdropFilter: 'none' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 640, margin: '0 auto', background: 'var(--bg)', border: '1px solid var(--line)', borderBottom: 'none', padding: '18px 18px 26px', maxHeight: '85dvh', overflowY: 'auto' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent)', fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase', marginBottom: 12 }}>
          <span>&gt; nova tarefa</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', padding: 0, width: 'auto' }}>esc</button>
        </div>

        {templates.length > 0 && field('modelo (opcional)', (
          <select
            value=""
            onChange={(e) => {
              const t = templates.find((x) => x.id === e.target.value);
              if (t) applyTemplate(t);
            }}
          >
            <option value="">— aplicar modelo —</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        ))}

        {field('título', <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="_" />)}
        {field('notas', <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="opcional" />)}

        <div style={{ display: 'flex', gap: 10 }}>
          {field('data/hora', <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />)}
          {field('prioridade', (
            <select value={priority} onChange={(e) => setPriority(e.target.value as 'alta' | 'media' | 'baixa')}>
              <option value="alta">!alta</option>
              <option value="media">média</option>
              <option value="baixa">baixa</option>
            </select>
          ))}
        </div>

        {field('categoria', (
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— nenhuma —</option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        ))}

        <div style={{ display: 'flex', gap: 10 }}>
          {field('recorrência', (
            <select value={freq} onChange={(e) => setFreq(e.target.value as typeof freq)}>
              <option value="">nenhuma</option>
              <option value="daily">diária</option>
              <option value="weekly">semanal</option>
              <option value="monthly">mensal</option>
              <option value="yearly">anual</option>
            </select>
          ))}
          {freq && field('intervalo', (
            <input type="number" min={1} value={interval_} onChange={(e) => setInterval_(Math.max(1, +e.target.value))} />
          ))}
        </div>

        {freq === 'weekly' && field('dias da semana', (
          <div style={{ display: 'flex', gap: 6 }}>
            {dias.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                style={{
                  flex: 1,
                  background: days.includes(i) ? 'var(--accent)' : 'transparent',
                  border: `1px solid ${days.includes(i) ? 'var(--accent)' : 'var(--line)'}`,
                  color: days.includes(i) ? 'var(--bg)' : 'var(--dim)',
                  padding: '8px 0',
                  cursor: 'pointer',
                  fontWeight: days.includes(i) ? 'bold' : 'normal',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        ))}

        {freq && field('fim (opcional)', <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />)}

        {field('lembrete', (
          <select value={reminder} onChange={(e) => setReminder(e.target.value)}>
            <option value="agora">na hora</option>
            <option value="30min">30min antes</option>
            <option value="1h">1h antes</option>
            <option value="1dia">1 dia antes</option>
          </select>
        ))}

        {field('itens (checklist)', (
          <>
            {subs.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                <span style={{ color: 'var(--accent)' }}>[ ]</span>
                <span style={{ flex: 1, fontSize: 13 }}>{s.title}</span>
                <button onClick={() => setSubs((prev) => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', padding: 0, width: 'auto' }}>
                  x
                </button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={subInput} onChange={(e) => setSubInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSub(); } }} placeholder="+ adicionar item" />
              <button onClick={addSub} style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--accent)', padding: '0 14px', cursor: 'pointer' }}>+</button>
            </div>
          </>
        ))}

        {error && <div className="error">[erro] {error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid var(--line)', color: 'var(--fg)', padding: 11, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', cursor: 'pointer' }}>
            [cancelar]
          </button>
          <button onClick={submit} disabled={saving || !title.trim()} style={{ flex: 1, background: 'var(--accent)', border: 'none', color: 'var(--bg)', padding: 11, fontSize: 11, letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 'bold', cursor: 'pointer' }}>
            {saving ? 'salvando…' : '[salvar]'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Fab e integração no layout**

`src/components/Fab.tsx`:

```tsx
'use client';

export default function Fab({ onClick }: { onClick: () => void }) {
  return (
    <button className="fab" onClick={onClick} aria-label="nova tarefa">
      +
    </button>
  );
}
```

Modifique `src/app/(app)/layout.tsx`: adicione estado + render:

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SyncStatus from '@/components/SyncStatus';
import Fab from '@/components/Fab';
import TaskForm from '@/components/TaskForm';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [formOpen, setFormOpen] = useState(false);

  const tabs = [
    { href: '/', label: 'hoje' },
    { href: '/lista', label: 'lista' },
    { href: '/concluidas', label: 'concluídas' },
    { href: '/calendario', label: 'calendário' },
  ];

  return (
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
      <main className="content">{children}</main>
      <Fab onClick={() => setFormOpen(true)} />
      <TaskForm open={formOpen} onClose={() => setFormOpen(false)} onCreated={() => window.location.reload()} />
    </div>
  );
}
```

- [ ] **Step 3: Rodar e testar**

Run: `npm run dev` → `+` abre o sheet → crie tarefa com recorrência multi-dia e subtarefas → aparece na Hoje; `npm test` continua verde.

- [ ] **Step 4: Commit**

```bash
git add src/components/TaskForm.tsx src/components/Fab.tsx src/app/\(app\)/layout.tsx && git commit -m "feat: modal de nova tarefa com subtarefas, modelos e multi-dia"
```
