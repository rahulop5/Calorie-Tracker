import { z } from 'zod';
import { ENTRY_SOURCES, FOOD_UNITS, MEAL_TYPES } from '../constants/enums';
import { LIMITS } from '../constants/limits';
import { dateOnlySchema, uuidSchema } from './common';
import { macrosSchema, microsSchema } from './nutrition';
import { paginationQuerySchema } from './pagination';

// `entryDate` is the day the user says they ate the food, so backfilling a missed
// day and importing history both work without special cases.
//
// `source` is absent on purpose: it records which code path created the entry,
// so the server sets it, not the client.
//
// Macros stay required. A blank-macro entry goes through
// POST /ai/estimate-nutrition first, which returns numbers for the user to
// confirm, and only then is a complete entry submitted here.
const entryFields = macrosSchema.extend({
  entryDate: dateOnlySchema,
  mealType: z.enum(MEAL_TYPES),
  foodName: z.string().trim().min(1).max(LIMITS.foodNameMaxLength),
  quantity: z.number().positive().max(LIMITS.entryMaxQuantity),
  unit: z.enum(FOOD_UNITS),
});

export const entryInputSchema = entryFields.extend({
  micros: microsSchema.default({}),
});
export type EntryInput = z.infer<typeof entryInputSchema>;

// Built from entryFields rather than from entryInputSchema, because `.partial()`
// does not remove a `.default()`: micros would then fill in as `{}` on a patch
// that never mentioned it and silently wipe the stored values.
export const entryUpdateSchema = entryFields
  .extend({ micros: microsSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'Provide at least one field to update',
  });
export type EntryUpdate = z.infer<typeof entryUpdateSchema>;

export const entrySchema = entryInputSchema.extend({
  id: uuidSchema,
  source: z.enum(ENTRY_SOURCES),
});
export type Entry = z.infer<typeof entrySchema>;

// `source` is per-batch rather than per-entry, and is narrowed to the two AI
// review screens that can produce a batch. A client still cannot claim MANUAL
// or CHAT, so the guarantee that matters is intact: an entry's source always
// reflects a real code path.
export const BULK_ENTRY_SOURCES = ['IMAGE', 'PDF'] as const;

export const bulkEntryInputSchema = z.object({
  entries: z.array(entryInputSchema).min(1).max(LIMITS.bulkEntryMaxCount),
  source: z.enum(BULK_ENTRY_SOURCES).default('PDF'),
});
export type BulkEntryInput = z.infer<typeof bulkEntryInputSchema>;

/**
 * All or nothing. Every row is validated by the route schema before the service
 * runs, and the insert is one transaction, so a rejected import leaves nothing
 * half-written. The validation error identifies the offending row by index
 * (`entries.147.calories`), which is what the review table needs to highlight it.
 */
export const bulkEntryResultSchema = z.object({
  created: z.number().int(),
});
export type BulkEntryResult = z.infer<typeof bulkEntryResultSchema>;

// Every sort ends on a unique column in the DAO, otherwise offset pagination
// could drop or repeat rows between pages.
export const ENTRY_SORTS = [
  'entryDate:desc',
  'entryDate:asc',
  'calories:desc',
  'calories:asc',
] as const;
export type EntrySort = (typeof ENTRY_SORTS)[number];

export const entryListQuerySchema = paginationQuerySchema
  .extend({
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
    mealType: z.enum(MEAL_TYPES).optional(),
    search: z.string().trim().min(1).max(LIMITS.foodNameMaxLength).optional(),
    sort: z.enum(ENTRY_SORTS).default('entryDate:desc'),
  })
  .refine((value) => !value.from || !value.to || value.from <= value.to, {
    message: '`from` must not be after `to`',
  });
export type EntryListQuery = z.infer<typeof entryListQuerySchema>;
