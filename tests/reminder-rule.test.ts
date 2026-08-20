import { describe, expect, it } from 'vitest';
import { computeRemindAt, computePushAt } from '@/lib/reminder-rule';

const due = new Date('2026-08-13T15:00:00.000Z');

describe('computeRemindAt', () => {
  it('agora = mesma hora', () => {
    expect(computeRemindAt(due, 'agora').toISOString()).toBe('2026-08-13T15:00:00.000Z');
  });
  it('30min antes', () => {
    expect(computeRemindAt(due, '30min').toISOString()).toBe('2026-08-13T14:30:00.000Z');
  });
  it('1h antes', () => {
    expect(computeRemindAt(due, '1h').toISOString()).toBe('2026-08-13T14:00:00.000Z');
  });
  it('1 dia antes', () => {
    expect(computeRemindAt(due, '1dia').toISOString()).toBe('2026-08-12T15:00:00.000Z');
  });
  it('custom usa a data informada', () => {
    expect(computeRemindAt(due, 'custom', '2026-08-13T08:00:00.000Z').toISOString()).toBe('2026-08-13T08:00:00.000Z');
  });
  it('custom inválida lança erro', () => {
    expect(() => computeRemindAt(due, 'custom', 'invalida')).toThrow();
  });
});

describe('computePushAt (antecedência desloca o push, não o lembrete)', () => {
  it('sem leadMinutes = mesma hora do lembrete', () => {
    expect(computePushAt(due, undefined).toISOString()).toBe('2026-08-13T15:00:00.000Z');
  });
  it('leadMinutes 15 = lembrete 15min antes', () => {
    expect(computePushAt(due, 15).toISOString()).toBe('2026-08-13T14:45:00.000Z');
  });
  it('leadMinutes 60 = lembrete 1h antes', () => {
    expect(computePushAt(due, 60).toISOString()).toBe('2026-08-13T14:00:00.000Z');
  });
  it('leadMinutes 1440 = lembrete 1 dia antes', () => {
    expect(computePushAt(due, 1440).toISOString()).toBe('2026-08-12T15:00:00.000Z');
  });
});
