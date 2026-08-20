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

  // Multi-dia semanal: para interval 1, a próxima é o primeiro dia marcado depois de `after`
  // (ex.: qui 13/08 + [1,3,5] → sex 14/08); para interval > 1, a semana atual é pulada e a
  // próxima é o primeiro dia marcado da semana `interval` semanas à frente (ex.: qui 13/08,
  // interval 2, [1,3,5] → sex 28/08).
  if (rule.daysOfWeek && rule.frequency === 'weekly') {
    const start =
      rule.interval === 1
        ? new Date(after.getTime() + 24 * 60 * 60 * 1000)
        : addInterval(after, 'weekly', rule.interval);
    for (let i = 0; i < 7; i++) {
      const c = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      if (rule.endDate && c.getTime() > new Date(rule.endDate).getTime()) return null;
      if (rule.daysOfWeek.includes(c.getUTCDay())) return c;
    }
    return null;
  }

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
