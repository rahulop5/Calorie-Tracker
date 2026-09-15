import {
  type EstimateNutritionInput,
  entryInputSchema,
  type ExtractionResult,
  type ImportCandidate,
  LIMITS,
  macroCalorieGap,
  MICRONUTRIENT_KEYS,
  type Micros,
  type NutritionDraft,
  todayDateOnly,
} from '@tracker/shared';
import { AppError } from '../../common/errors';
import { getProvider } from './provider';
import type { ImageUpload, PdfUpload } from './provider';

/** How far stated calories may sit from what the macros imply before we warn. */
const MACRO_GAP_WARN = 0.25;

const KNOWN_MICROS = new Set<string>(MICRONUTRIENT_KEYS);

/**
 * Post-checks live here, not in the prompt. A prompt is a request; this is the
 * part that actually holds, and it runs on every provider including the stub.
 */
function cleanMicros(micros: Micros): Micros {
  const cleaned: Micros = {};

  for (const [key, value] of Object.entries(micros)) {
    if (!KNOWN_MICROS.has(key) || typeof value !== 'number') {
      continue;
    }

    if (Number.isFinite(value) && value >= 0) {
      cleaned[key as keyof Micros] = value;
    }
  }

  return cleaned;
}

function isPlausible(draft: NutritionDraft): boolean {
  const values = [draft.calories, draft.proteinG, draft.carbsG, draft.fatG, draft.quantity];

  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    return false;
  }

  return draft.calories <= LIMITS.entryMaxCalories && draft.quantity <= LIMITS.entryMaxQuantity;
}

type ReviewedDrafts = {
  drafts: NutritionDraft[];
  warnings: string[];
};

/** Drops impossible drafts, flags implausible ones, and strips unknown micros. */
function reviewDrafts(drafts: NutritionDraft[]): ReviewedDrafts {
  const kept: NutritionDraft[] = [];
  const warnings: string[] = [];

  for (const draft of drafts) {
    if (!isPlausible(draft)) {
      warnings.push(`Ignored "${draft.foodName}": the numbers were out of range.`);
      continue;
    }

    const cleaned = { ...draft, micros: cleanMicros(draft.micros) };

    // Printed labels round, so a gap is a warning rather than a rejection.
    if (macroCalorieGap(cleaned) > MACRO_GAP_WARN) {
      warnings.push(
        `"${cleaned.foodName}": the calories do not match the macros, so check them.`,
      );
    }

    kept.push(cleaned);
  }

  return { drafts: kept, warnings };
}

export const aiService = {
  async extractFromImage(image: ImageUpload): Promise<ExtractionResult> {
    const result = await getProvider().extractNutrition(image);
    const reviewed = reviewDrafts(result.drafts);

    if (reviewed.drafts.length === 0) {
      throw AppError.aiProvider('No nutrition information could be read from that photo');
    }

    return {
      kind: result.kind,
      drafts: reviewed.drafts,
      confidence: result.confidence,
      warnings: [...result.warnings, ...reviewed.warnings],
    };
  },

  async estimate(input: EstimateNutritionInput) {
    const result = await getProvider().estimateNutrition(input);
    const reviewed = reviewDrafts([result.draft]);
    const draft = reviewed.drafts[0];

    if (!draft) {
      throw AppError.aiProvider('Could not estimate nutrition for that food');
    }

    return {
      // Keep what the user typed: an estimator must not rename their food.
      draft: { ...draft, foodName: input.foodName, quantity: input.quantity, unit: input.unit },
      confidence: result.confidence,
      warnings: [...result.warnings, ...reviewed.warnings],
    };
  },

  /**
   * Parses a diary and validates every row with the same schema a manual entry
   * passes through, so the review table can flag a bad row instead of dropping it.
   */
  async parsePdf(pdf: PdfUpload): Promise<ImportCandidate[]> {
    const rows = await getProvider().parseDiary(pdf);

    return rows.map((row, index) => {
      const draft = {
        entryDate: row.entryDate ?? todayDateOnly(),
        mealType: row.mealType,
        foodName: row.foodName,
        quantity: row.quantity,
        unit: row.unit,
        calories: row.calories,
        proteinG: row.proteinG,
        carbsG: row.carbsG,
        fatG: row.fatG,
        micros: cleanMicros(row.micros),
      };

      const issues: string[] = [];

      if (row.entryDate === null) {
        issues.push('The date could not be read, so today has been filled in.');
      }

      const parsed = entryInputSchema.safeParse(draft);

      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          issues.push(`${issue.path.join('.') || 'row'}: ${issue.message}`);
        }
      }

      return {
        row: index,
        draft,
        issues,
        valid: parsed.success && row.entryDate !== null,
      };
    });
  },
};
