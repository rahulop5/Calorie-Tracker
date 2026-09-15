import { z } from 'zod';
import { MEAL_TYPES } from '../constants/enums';
import { LIMITS } from '../constants/limits';
import { countDays } from '../domain/dates';
import { dateOnlySchema } from './common';
import { goalSchema } from './goal';
import { paginationQuerySchema } from './pagination';

export const GROUP_BY_OPTIONS = ['day', 'week'] as const;
export type GroupBy = (typeof GROUP_BY_OPTIONS)[number];

const rangeFields = {
  from: dateOnlySchema,
  to: dateOnlySchema,
};

const rangeMessage = `Range must be in order and no longer than ${LIMITS.reportMaxRangeDays} days`;

// Micronutrients are summed in memory, so an unbounded window is not safe.
function isUsableRange(value: { from: string; to: string }): boolean {
  return value.from <= value.to && countDays(value.from, value.to) <= LIMITS.reportMaxRangeDays;
}

export const reportRangeQuerySchema = z
  .object(rangeFields)
  .refine(isUsableRange, { message: rangeMessage });
export type ReportRangeQuery = z.infer<typeof reportRangeQuerySchema>;

export const bucketedReportQuerySchema = paginationQuerySchema
  .extend({ ...rangeFields, groupBy: z.enum(GROUP_BY_OPTIONS).default('day') })
  .refine(isUsableRange, { message: rangeMessage });
export type BucketedReportQuery = z.infer<typeof bucketedReportQuerySchema>;

export const nutritionTotalsSchema = z.object({
  calories: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
});
export type NutritionTotals = z.infer<typeof nutritionTotalsSchema>;

/** Nulls throughout, because a user may have no goal covering the bucket. */
export const comparisonSchema = z.object({
  goal: z.number().nullable(),
  actual: z.number(),
  diff: z.number().nullable(),
  percent: z.number().nullable(),
});

export const summaryReportSchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  days: z.number().int(),
  entries: z.number().int(),
  totals: nutritionTotalsSchema,
  dailyAverage: nutritionTotalsSchema,
  goal: goalSchema.nullable(),
  goalIsBaseline: z.boolean(),
});
export type SummaryReport = z.infer<typeof summaryReportSchema>;

export const caloriePointSchema = z.object({
  bucket: dateOnlySchema,
  calories: z.number(),
  goalCalories: z.number().nullable(),
  goalIsBaseline: z.boolean(),
});
export type CaloriePoint = z.infer<typeof caloriePointSchema>;

export const macroPointSchema = nutritionTotalsSchema.extend({
  bucket: dateOnlySchema,
  proteinPercent: z.number(),
  carbsPercent: z.number(),
  fatPercent: z.number(),
});
export type MacroPoint = z.infer<typeof macroPointSchema>;

export const goalVsActualPointSchema = z.object({
  bucket: dateOnlySchema,
  // True when the bucket predates every goal the user set, so the comparison is
  // against their earliest goal rather than one that was really active.
  goalIsBaseline: z.boolean(),
  calories: comparisonSchema,
  proteinG: comparisonSchema,
  carbsG: comparisonSchema,
  fatG: comparisonSchema,
});
export type GoalVsActualPoint = z.infer<typeof goalVsActualPointSchema>;

export const microSummaryItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  unit: z.string(),
  total: z.number(),
  dailyAverage: z.number(),
  dailyValue: z.number().nullable(),
  percentOfDailyValue: z.number().nullable(),
});

export const microsReportSchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  days: z.number().int(),
  items: z.array(microSummaryItemSchema),
});
export type MicrosReport = z.infer<typeof microsReportSchema>;

export const mealBreakdownItemSchema = nutritionTotalsSchema.extend({
  mealType: z.enum(MEAL_TYPES),
  entries: z.number().int(),
  percentOfCalories: z.number(),
});

export const mealBreakdownReportSchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  items: z.array(mealBreakdownItemSchema),
});
export type MealBreakdownReport = z.infer<typeof mealBreakdownReportSchema>;

export const weightPointSchema = z.object({
  measuredOn: dateOnlySchema,
  weightKg: z.number(),
  targetWeightKg: z.number().nullable(),
  goalIsBaseline: z.boolean(),
});
export type WeightPoint = z.infer<typeof weightPointSchema>;
