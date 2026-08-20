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
