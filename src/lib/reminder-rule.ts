export const REMINDER_PRESETS = ['agora', '30min', '1h', '1dia', 'custom'] as const;
export type ReminderPreset = (typeof REMINDER_PRESETS)[number];

export function computeRemindAt(dueAt: Date, preset: ReminderPreset, customAt?: string): Date {
  switch (preset) {
    case 'agora':
      return new Date(dueAt.getTime());
    case '30min':
      return new Date(dueAt.getTime() - 30 * 60 * 1000);
    case '1h':
      return new Date(dueAt.getTime() - 60 * 60 * 1000);
    case '1dia':
      return new Date(dueAt.getTime() - 24 * 60 * 60 * 1000);
    case 'custom': {
      const d = customAt ? new Date(customAt) : new Date(NaN);
      if (Number.isNaN(d.getTime())) throw new Error('data de lembrete inválida');
      return d;
    }
  }
}

/** Horário do PUSH: lembrete deslocado pela antecedência (leadMinutes), sem mudar o `remindAt`. */
export function computePushAt(remindAt: Date, leadMinutes?: number | null): Date {
  if (!leadMinutes) return new Date(remindAt.getTime());
  return new Date(remindAt.getTime() - leadMinutes * 60 * 1000);
}
