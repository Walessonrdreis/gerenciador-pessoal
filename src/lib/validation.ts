import { z } from 'zod';

export const PRIORITIES = ['alta', 'media', 'baixa'] as const;

export const subtaskSchema = z.object({
  title: z.string().trim().min(1, 'título da subtarefa é obrigatório').max(200),
  done: z.boolean().default(false),
  ordem: z.number().int().min(0).default(0),
});

export const taskCreateSchema = z.object({
  title: z.string().trim().min(1, 'título é obrigatório').max(200),
  notes: z.string().max(2000).optional().nullable(),
  priority: z.enum(PRIORITIES).default('media'),
  categoryId: z.string().cuid().optional().nullable(),
  dueAt: z.string().datetime({ offset: true }).refine((v) => !Number.isNaN(new Date(v).getTime()), 'data inválida'),
  rule: z
    .object({
      frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
      interval: z.number().int().min(1).default(1),
      daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
      endDate: z.string().datetime({ offset: true }).nullable().optional(),
    })
    .nullable()
    .optional(),
  subtasks: z.array(subtaskSchema).max(50).optional(),
  ordem: z.number().int().min(0).optional(),
  reminder: z
    .object({
      preset: z.enum(['agora', '30min', '1h', '1dia', 'custom']),
      customAt: z.string().datetime({ offset: true }).optional(),
    })
    .nullable()
    .optional(),
});

export const taskUpdateSchema = taskCreateSchema.partial().extend({
  done: z.boolean().optional(),
  occurrenceId: z.string().cuid().optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'nome é obrigatório').max(40),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'cor inválida').default('#7FD88F'),
});
