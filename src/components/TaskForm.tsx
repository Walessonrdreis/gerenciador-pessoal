'use client';

import { useEffect, useState } from 'react';
import { apiGet, apiPatch, apiPost } from '@/lib/api';
import type { TaskRowData } from '@/hooks/useTasks';

interface Category { id: string; name: string; color: string }
interface Template { id: string; name: string; subtasks: { titulo: string; ordem: number }[] | null; priority: string; categoryId: string | null; reminderPreset: string | null }
interface SubInput { title: string; done?: boolean }

export default function TaskForm({
  open,
  onClose,
  onCreated,
  task,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** presente = editando essa tarefa; ausente = criando nova */
  task?: TaskRowData | null;
}) {
  const editing = Boolean(task);
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
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#7FD88F');
  const [creatingCat, setCreatingCat] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubInput('');
    setNewCatOpen(false);
    setNewCatName('');
    apiGet<Category[]>('/api/categories').then(setCats).catch(() => {});
    apiGet<Template[]>('/api/templates').then(setTemplates).catch(() => {});

    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? '');
      setPriority(task.priority as 'alta' | 'media' | 'baixa');
      setCategoryId(task.category?.id ?? '');
      const due = new Date(task.dueAt);
      due.setSeconds(0, 0);
      setDueAt(new Date(due.getTime() - due.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
      const rule = task.rule as { frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly'; interval?: number; daysOfWeek?: number[]; endDate?: string } | null;
      setFreq(rule?.frequency ?? '');
      setInterval_(rule?.interval ?? 1);
      setDays(rule?.daysOfWeek ?? []);
      setEndDate(rule?.endDate ? rule.endDate.slice(0, 10) : '');
      setReminder(task.reminderPreset ?? '30min');
      setSubs(task.subtasks.map((s) => ({ title: s.title, done: s.done })));
    } else {
      setTitle('');
      setNotes('');
      setPriority('media');
      setCategoryId('');
      const d = new Date(Date.now() + 60 * 60 * 1000);
      d.setMinutes(0, 0, 0);
      setDueAt(d.toISOString().slice(0, 16));
      setFreq('');
      setInterval_(1);
      setDays([]);
      setEndDate('');
      setReminder('30min');
      setSubs([]);
    }
  }, [open, task]);

  if (!open) return null;

  const applyTemplate = (t: Template) => {
    setTitle(t.name);
    setPriority(t.priority as 'alta' | 'media' | 'baixa');
    if (t.categoryId) setCategoryId(t.categoryId);
    if (t.reminderPreset) setReminder(t.reminderPreset);
    setSubs((t.subtasks ?? []).map((s) => ({ title: s.titulo })));
  };

  const createCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    setCreatingCat(true);
    try {
      const cat = await apiPost<Category>('/api/categories', { name, color: newCatColor });
      setCats((prev) => [...prev, cat].sort((a, b) => a.name.localeCompare(b.name)));
      setCategoryId(cat.id);
      setNewCatName('');
      setNewCatOpen(false);
    } catch (e) {
      setError('não foi possível criar a categoria (nome já existe?)');
      console.error(e);
    } finally {
      setCreatingCat(false);
    }
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
        // na edição, dueAt reagenda a ocorrência pendente mais próxima (a rota trata isso à parte da Task)
        dueAt: new Date(dueAt).toISOString(),
        categoryId: categoryId || null,
        rule: freq ? { frequency: freq, interval: interval_, ...(freq === 'weekly' && days.length ? { daysOfWeek: days } : {}), ...(endDate ? { endDate: new Date(endDate).toISOString() } : {}) } : null,
        subtasks: subs.map((s) => ({ title: s.title, done: s.done ?? false })),
        reminder: { preset: reminder },
      };
      if (editing && task) {
        await apiPatch(`/api/tasks/${task.taskId}`, body);
      } else {
        await apiPost('/api/tasks', body);
      }
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
          <span>&gt; {editing ? 'editar tarefa' : 'nova tarefa'}</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--dim)', cursor: 'pointer', padding: 0, width: 'auto' }}>esc</button>
        </div>

        {!editing && templates.length > 0 && field('modelo (opcional)', (
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
          <>
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={{ flex: 1 }} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">— nenhuma —</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setNewCatOpen((v) => !v)}
                style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--accent)', padding: '0 14px', cursor: 'pointer' }}
              >
                + nova
              </button>
            </div>
            {newCatOpen && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
                <input
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createCategory(); } }}
                  placeholder="nome da categoria"
                  style={{ flex: 1 }}
                />
                <input
                  type="color"
                  value={newCatColor}
                  onChange={(e) => setNewCatColor(e.target.value)}
                  style={{ width: 34, height: 34, padding: 2, background: 'transparent', border: '1px solid var(--line)' }}
                  aria-label="cor da categoria"
                />
                <button
                  type="button"
                  onClick={createCategory}
                  disabled={!newCatName.trim() || creatingCat}
                  style={{ background: 'var(--accent)', border: 'none', color: 'var(--bg)', padding: '0 14px', height: 34, cursor: 'pointer' }}
                >
                  {creatingCat ? '…' : 'criar'}
                </button>
              </div>
            )}
          </>
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
                <span style={{ color: 'var(--accent)' }}>{s.done ? '[x]' : '[ ]'}</span>
                <input
                  value={s.title}
                  onChange={(e) =>
                    setSubs((prev) => prev.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                  }
                  style={{ flex: 1, fontSize: 13 }}
                />
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
            {saving ? 'salvando…' : editing ? '[atualizar]' : '[salvar]'}
          </button>
        </div>
      </div>
    </div>
  );
}
