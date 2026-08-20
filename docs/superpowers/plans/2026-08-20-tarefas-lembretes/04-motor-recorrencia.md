# Task 4: Motor de recorrência (TDD) com multi-dia

**Files:**
- Create: `src/lib/recurrence.ts`
- Test: `tests/recurrence.test.ts`

**Interfaces:**
- Produces:
  - `type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'`
  - `interface RecurrenceRule { frequency: Frequency; interval: number; daysOfWeek?: number[]; endDate: string | null }`
  - `parseRule(input: unknown): { ok: true; rule: RecurrenceRule } | { ok: false; error: string }`
  - `nextOccurrence(rule: RecurrenceRule, after: Date): Date | null` — primeira data estritamente depois de `after` que respeita a regra (incluindo `daysOfWeek`) e não ultrapassa `endDate`

- [ ] **Step 1: Escrever os testes que falham**

`tests/recurrence.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { nextOccurrence, parseRule } from '@/lib/recurrence';

const rule = (
  f: 'daily' | 'weekly' | 'monthly' | 'yearly',
  interval = 1,
  endDate: string | null = null,
  daysOfWeek?: number[]
) => ({ frequency: f, interval, endDate, ...(daysOfWeek ? { daysOfWeek } : {}) });

describe('parseRule', () => {
  it('aceita regra válida', () => {
    expect(parseRule({ frequency: 'weekly', interval: 2 }).ok).toBe(true);
  });
  it('aceita daysOfWeek', () => {
    expect(parseRule({ frequency: 'weekly', daysOfWeek: [1, 3, 5] }).ok).toBe(true);
  });
  it('rejeita frequência desconhecida', () => {
    expect(parseRule({ frequency: 'mensal' }).ok).toBe(false);
  });
  it('rejeita intervalo zero ou negativo', () => {
    expect(parseRule({ frequency: 'daily', interval: 0 }).ok).toBe(false);
    expect(parseRule({ frequency: 'daily', interval: -2 }).ok).toBe(false);
  });
  it('rejeita daysOfWeek fora de 0-6', () => {
    expect(parseRule({ frequency: 'weekly', daysOfWeek: [7] }).ok).toBe(false);
  });
  it('rejeita endDate inválido', () => {
    expect(parseRule({ frequency: 'daily', endDate: 'nao-e-data' }).ok).toBe(false);
  });
});

describe('nextOccurrence', () => {
  const after = new Date('2026-08-13T10:00:00Z'); // quinta-feira

  it('diária: próximo dia', () => {
    expect(nextOccurrence(rule('daily'), after)?.toISOString()).toBe('2026-08-14T10:00:00.000Z');
  });

  it('semanal: +7 dias', () => {
    expect(nextOccurrence(rule('weekly'), after)?.toISOString()).toBe('2026-08-20T10:00:00.000Z');
  });

  it('semanal com intervalo 2: +14 dias', () => {
    expect(nextOccurrence(rule('weekly', 2), after)?.toISOString()).toBe('2026-08-27T10:00:00.000Z');
  });

  it('mensal: preserva dia 13', () => {
    expect(nextOccurrence(rule('monthly'), after)?.toISOString()).toBe('2026-09-13T10:00:00.000Z');
  });

  it('mensal: dia 31 de janeiro clampado para fevereiro', () => {
    const jan31 = new Date('2026-01-31T08:00:00Z');
    expect(nextOccurrence(rule('monthly'), jan31)?.toISOString()).toBe('2026-02-28T08:00:00.000Z');
  });

  it('anual: mesmo dia e hora no ano seguinte', () => {
    expect(nextOccurrence(rule('yearly'), after)?.toISOString()).toBe('2027-08-13T10:00:00.000Z');
  });

  it('anual com 29/fev: clamp para 28/fev em ano não bissexto', () => {
    const feb29 = new Date('2024-02-29T08:00:00Z');
    expect(nextOccurrence(rule('yearly'), feb29)?.toISOString()).toBe('2025-02-28T08:00:00.000Z');
  });

  it('multi-dia: próxima = próximo dia marcado (seg/qua/sex)', () => {
    // after = qui 13/08; próximo marcado = sex 14/08
    expect(nextOccurrence(rule('weekly', 1, null, [1, 3, 5]), after)?.toISOString()).toBe('2026-08-14T10:00:00.000Z');
  });

  it('multi-dia: pula dias não marcados na semana seguinte', () => {
    // after = sex 14/08 (marcado); próxima = seg 17/08 (2 dias, não +7)
    const afterFri = new Date('2026-08-14T10:00:00Z');
    expect(nextOccurrence(rule('weekly', 1, null, [1, 3, 5]), afterFri)?.toISOString()).toBe('2026-08-17T10:00:00.000Z');
  });

  it('multi-dia: preserva o intervalo entre semanas', () => {
    // after = qui 13/08; interval 2, dias seg/qua/sex → próxima = sex 28/08 (14 dias depois)
    expect(nextOccurrence(rule('weekly', 2, null, [1, 3, 5]), after)?.toISOString()).toBe('2026-08-28T10:00:00.000Z');
  });

  it('retorna null quando a próxima ocorrência passa do endDate', () => {
    const ruleWithEnd = { frequency: 'daily' as const, interval: 1, endDate: '2026-08-14T10:00:00.000Z' };
    expect(nextOccurrence(ruleWithEnd, new Date('2026-08-14T10:00:00.000Z'))).toBeNull();
  });

  it('null quando endDate já passou', () => {
    const ruleWithEnd = { frequency: 'daily' as const, interval: 1, endDate: '2026-08-01T00:00:00.000Z' };
    expect(nextOccurrence(ruleWithEnd, after)).toBeNull();
  });

  it('nunca retorna a própria data (estritamente depois)', () => {
    expect(nextOccurrence(rule('daily'), after)!.getTime()).toBeGreaterThan(after.getTime());
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run tests/recurrence.test.ts`
Expected: FAIL (módulo `@/lib/recurrence` não existe).

- [ ] **Step 3: Implementar**

`src/lib/recurrence.ts`:

```ts
export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RecurrenceRule {
  frequency: Frequency;
  interval: number;
  daysOfWeek?: number[];
  endDate: string | null;
}

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly', 'yearly'];

export function parseRule(input: unknown): { ok: true; rule: RecurrenceRule } | { ok: false; error: string } {
  if (input === null || typeof input !== 'object') return { ok: false, error: 'regra inválida' };
  const r = input as Record<string, unknown>;

  if (typeof r.frequency !== 'string' || !FREQUENCIES.includes(r.frequency as Frequency)) {
    return { ok: false, error: 'frequência inválida' };
  }
  const interval = r.interval === undefined ? 1 : r.interval;
  if (typeof interval !== 'number' || !Number.isInteger(interval) || interval < 1) {
    return { ok: false, error: 'intervalo deve ser inteiro >= 1' };
  }
  let daysOfWeek: number[] | undefined;
  if (r.daysOfWeek !== undefined) {
    if (!Array.isArray(r.daysOfWeek) || !r.daysOfWeek.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      return { ok: false, error: 'daysOfWeek deve ser array de 0-6' };
    }
    daysOfWeek = r.daysOfWeek as number[];
  }
  let endDate: string | null = null;
  if (r.endDate !== undefined && r.endDate !== null) {
    if (typeof r.endDate !== 'string' || Number.isNaN(new Date(r.endDate).getTime())) {
      return { ok: false, error: 'data de fim inválida' };
    }
    endDate = r.endDate;
  }
  return { ok: true, rule: { frequency: r.frequency as Frequency, interval, ...(daysOfWeek ? { daysOfWeek } : {}), endDate } };
}

function addInterval(d: Date, frequency: Frequency, n: number): Date {
  const r = new Date(d);
  if (frequency === 'daily') r.setUTCDate(r.getUTCDate() + n);
  if (frequency === 'weekly') r.setUTCDate(r.getUTCDate() + 7 * n);
  if (frequency === 'monthly' || frequency === 'yearly') {
    const months = frequency === 'monthly' ? n : 12 * n;
    const day = r.getUTCDate();
    r.setUTCDate(1);
    r.setUTCMonth(r.getUTCMonth() + months);
    const lastDay = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
    r.setUTCDate(Math.min(day, lastDay));
  }
  return r;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth() && a.getUTCDate() === b.getUTCDate();
}

export function nextOccurrence(rule: RecurrenceRule, after: Date): Date | null {
  if (rule.endDate && new Date(rule.endDate).getTime() <= after.getTime()) return null;

  let candidate = addInterval(after, rule.frequency, rule.interval);
  for (let i = 0; i < 1200; i++) {
    if (rule.endDate && candidate.getTime() > new Date(rule.endDate).getTime()) return null;
    if (candidate.getTime() > after.getTime()) {
      if (!rule.daysOfWeek || rule.daysOfWeek.includes(candidate.getUTCDay())) return candidate;
    }
    candidate = addInterval(candidate, rule.frequency, rule.interval);
    // Guarda contra loop infinito com daysOfWeek: se a data não avançou, força +1 dia
    if (rule.daysOfWeek && sameDay(candidate, after)) candidate = new Date(candidate.getTime() + 24 * 60 * 60 * 1000);
  }
  return null;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run tests/recurrence.test.ts`
Expected: 16 testes PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/recurrence.ts tests/recurrence.test.ts && git commit -m "feat: motor de recorrência multi-dia com testes"
```
