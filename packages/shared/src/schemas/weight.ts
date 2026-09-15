import { z } from 'zod';
import { LIMITS } from '../constants/limits';
import { dateOnlySchema, uuidSchema } from './common';
import { paginationQuerySchema } from './pagination';

// One weight per day. Logging the same day again overwrites it, which is why the
// route is a PUT and there is no separate update shape.
export const weightLogInputSchema = z.object({
  // Defaults to today in the service.
  measuredOn: dateOnlySchema.optional(),
  weightKg: z.number().min(LIMITS.weightMinKg).max(LIMITS.weightMaxKg),
});
export type WeightLogInput = z.infer<typeof weightLogInputSchema>;

export const weightLogSchema = z.object({
  id: uuidSchema,
  measuredOn: dateOnlySchema,
  weightKg: z.number(),
});
export type WeightLog = z.infer<typeof weightLogSchema>;

export const weightListQuerySchema = paginationQuerySchema
  .extend({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '`from` must not be after `to`',
  });
export type WeightListQuery = z.infer<typeof weightListQuerySchema>;
