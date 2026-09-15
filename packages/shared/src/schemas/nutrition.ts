import { z } from 'zod';
import { LIMITS } from '../constants/limits';
import { MICRONUTRIENT_KEYS } from '../constants/nutrients';

const microAmount = z.number().nonnegative().finite();

// Built from MICRONUTRIENT_KEYS so the key list has a single source of truth.
//
// A partial record rather than a strict object, because 25 optional properties
// exceeds the 24 that Anthropic allows in a tool or structured-output schema.
// Validation is unchanged: an unknown key is still rejected, so the model cannot
// invent `vitaminC`, and every key stays optional.
//
// `partialRecord` rather than `record`, because `record` compiles to a JSON
// Schema that lists all 25 keys as required. The model reads that literally and
// fills every one of them with a fabricated number.
export const microsSchema = z.partialRecord(z.enum(MICRONUTRIENT_KEYS), microAmount);
export type Micros = z.infer<typeof microsSchema>;

export const macrosSchema = z.object({
  calories: z.number().nonnegative().max(LIMITS.entryMaxCalories),
  proteinG: z.number().nonnegative().max(LIMITS.entryMaxMacroGrams),
  carbsG: z.number().nonnegative().max(LIMITS.entryMaxMacroGrams),
  fatG: z.number().nonnegative().max(LIMITS.entryMaxMacroGrams),
});
export type Macros = z.infer<typeof macrosSchema>;
