import type { Macros } from '../schemas/nutrition';

/** Calories the macros imply, at 4 kcal per gram of protein and carbs, 9 for fat. */
export function caloriesFromMacros(macros: Macros): number {
  return macros.proteinG * 4 + macros.carbsG * 4 + macros.fatG * 9;
}

/**
 * How far the stated calories sit from what the macros imply, as a ratio.
 * Labels round their printed values, so a small gap is normal. The AI
 * post-checks use this to raise a warning, not to reject.
 */
export function macroCalorieGap(macros: Macros): number {
  const implied = caloriesFromMacros(macros);

  if (implied === 0) {
    return 0;
  }

  return Math.abs(macros.calories - implied) / implied;
}
