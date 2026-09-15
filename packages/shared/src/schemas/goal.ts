import { z } from 'zod';
import { LIMITS } from '../constants/limits';
import { dateOnlySchema, uuidSchema } from './common';

export const goalInputSchema = z.object({
  dailyCalories: z.number().int().positive().max(LIMITS.goalMaxCalories),
  proteinG: z.number().nonnegative().max(LIMITS.goalMaxMacroGrams),
  carbsG: z.number().nonnegative().max(LIMITS.goalMaxMacroGrams),
  fatG: z.number().nonnegative().max(LIMITS.goalMaxMacroGrams),
  targetWeightKg: z.number().min(LIMITS.weightMinKg).max(LIMITS.weightMaxKg).nullable().optional(),
  // Defaults to today in the service.
  effectiveFrom: dateOnlySchema.optional(),
});
export type GoalInput = z.infer<typeof goalInputSchema>;

// Changing a goal creates a new version. The service merges these fields onto
// the current goal, so the user only sends what actually changed. The first goal
// must supply everything, which the service checks.
export const goalUpdateSchema = goalInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });
export type GoalUpdate = z.infer<typeof goalUpdateSchema>;

export const goalSchema = z.object({
  id: uuidSchema,
  dailyCalories: z.number().int(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  targetWeightKg: z.number().nullable(),
  effectiveFrom: dateOnlySchema,
});
export type Goal = z.infer<typeof goalSchema>;

export const currentGoalQuerySchema = z.object({
  on: dateOnlySchema.optional(),
});
export type CurrentGoalQuery = z.infer<typeof currentGoalQuerySchema>;
