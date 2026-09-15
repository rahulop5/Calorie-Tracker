import { z } from 'zod';
import { FOOD_UNITS, MEAL_TYPES } from '../constants/enums';
import { LIMITS } from '../constants/limits';
import { dateOnlySchema } from './common';
import { macrosSchema, microsSchema } from './nutrition';

/** A proposed entry. Nothing is stored until the user submits it as an entry. */
export const nutritionDraftSchema = macrosSchema.extend({
  foodName: z.string().trim().min(1).max(LIMITS.foodNameMaxLength),
  quantity: z.number().positive().max(LIMITS.entryMaxQuantity),
  unit: z.enum(FOOD_UNITS),
  micros: microsSchema.default({}),
});
export type NutritionDraft = z.infer<typeof nutritionDraftSchema>;

export const EXTRACTION_KINDS = ['LABEL', 'PLATE'] as const;
export type ExtractionKind = (typeof EXTRACTION_KINDS)[number];

export const extractionResultSchema = z.object({
  kind: z.enum(EXTRACTION_KINDS),
  drafts: z.array(nutritionDraftSchema),
  confidence: z.number().min(0).max(1),
  /** Every assumption the model made, plus anything our post-checks flagged. */
  warnings: z.array(z.string()),
});
export type ExtractionResult = z.infer<typeof extractionResultSchema>;

export const estimateNutritionInputSchema = z.object({
  foodName: z.string().trim().min(1).max(LIMITS.foodNameMaxLength),
  quantity: z.number().positive().max(LIMITS.entryMaxQuantity),
  unit: z.enum(FOOD_UNITS),
});
export type EstimateNutritionInput = z.infer<typeof estimateNutritionInputSchema>;

export const estimateResultSchema = z.object({
  draft: nutritionDraftSchema,
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()),
});
export type EstimateResult = z.infer<typeof estimateResultSchema>;

/** One parsed diary row, before the user has reviewed it. */
export const diaryRowSchema = z.object({
  entryDate: dateOnlySchema.nullable(),
  mealType: z.enum(MEAL_TYPES),
  foodName: z.string(),
  quantity: z.number(),
  unit: z.enum(FOOD_UNITS),
  calories: z.number(),
  proteinG: z.number(),
  carbsG: z.number(),
  fatG: z.number(),
  micros: microsSchema.default({}),
});
export type DiaryRow = z.infer<typeof diaryRowSchema>;
