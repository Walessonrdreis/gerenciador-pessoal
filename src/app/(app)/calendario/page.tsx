'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTasks } from '@/hooks/useTasks';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function Calendario() {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { ano: d.getFullYear(), mes: d.getMonth() };
  });
  const { rows } = useTasks('?status=todas');

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const d = new Date(r.dueAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [rows]);

  const primeiro = new Date(cursor.ano, cursor.mes, 1);
  const primeiroDiaSemana = primeiro.getDay(); // 0 = domingo
  const diasNoMes = new Date(cursor.ano, cursor.mes + 1, 0).getDate();
  const hoje = new Date();
  const hojeKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(hoje.getDate()).padStart(2, '0')}`;

  const cells: (string | null)[] = [];
  for (let i = 0; i < primeiroDiaSemana; i++) cells.push(null);
  for (let dia = 1; dia <= diasNoMes; dia++) {
    cells.push(`${cursor.ano}-${String(cursor.mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`);
  }

  const mudarMes = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.ano, c.mes + delta, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  };

  return (
    <>
      <div className="date-head">
        calendário <b>▮</b>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '12px 0' }}>
        <button onClick={() => mudarMes(-1)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 16, padding: 0, width: 'auto' }}>
          &lt;
        </button>
        <span style={{ fontSize: 14, letterSpacing: '.1em', textTransform: 'uppercase' }}>
          {MESES[cursor.mes]} {cursor.ano}
        </span>
        <button onClick={() => mudarMes(1)} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', fontSize: 16, padding: 0, width: 'auto' }}>
          &gt;
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 6 }}>
        {DIAS.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 9, color: 'var(--dim)', letterSpacing: '.08em' }}>
            {d}
          </div>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((key, i) =>
          key === null ? (
            <div key={`vazio-${i}`} style={{ aspectRatio: '1', border: '1px dashed transparent' }} />
          ) : (
            <Link
              key={key}
              href={`/lista?dia=${key}`}
              style={{
                aspectRatio: '1',
                border: '1px solid var(--line)',
                color: key === hojeKey ? 'var(--accent)' : 'var(--fg)',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                background: key === hojeKey ? 'rgba(127,216,143,.08)' : 'transparent',
              }}
            >
              <span>
                {Number(key.slice(-2))}
                {byDay.has(key) && <span style={{ color: 'var(--accent)' }}> ·{byDay.get(key)}</span>}
              </span>
            </Link>
          )
        )}
      </div>

      <div className="sub" style={{ marginTop: 12 }}>
        toque num dia para ver as tarefas na lista
      </div>
    </>
  );
}
