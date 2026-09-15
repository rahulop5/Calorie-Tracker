import { MEAL_TYPES, type FoodUnit, type MealType } from '@tracker/shared';

const wholeNumber = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function formatNumber(value: number): string {
  return wholeNumber.format(value);
}

/** Grams read better with a decimal until they get large. */
export function formatGrams(value: number): string {
  const formatted = value >= 100 ? wholeNumber.format(value) : oneDecimal.format(value);

  return `${formatted} g`;
}

export function formatCalories(value: number): string {
  return `${wholeNumber.format(value)} kcal`;
}

export function formatPercent(value: number | null): string {
  return value === null ? '—' : `${wholeNumber.format(value)}%`;
}

export function formatWeight(value: number): string {
  return `${oneDecimal.format(value)} kg`;
}

/** Compact form for stat tiles: 1,284 / 12.9K / 1.4M. */
export function formatCompact(value: number): string {
  if (Math.abs(value) >= 1_000_000) {
    return `${oneDecimal.format(value / 1_000_000)}M`;
  }

  if (Math.abs(value) >= 10_000) {
    return `${oneDecimal.format(value / 1000)}K`;
  }

  return wholeNumber.format(value);
}

export function formatSigned(value: number): string {
  const sign = value > 0 ? '+' : '';

  return `${sign}${wholeNumber.format(value)}`;
}

const MEAL_LABELS: Record<MealType, string> = {
  BREAKFAST: 'Breakfast',
  LUNCH: 'Lunch',
  DINNER: 'Dinner',
  SNACK: 'Snack',
};

export function mealLabel(meal: MealType): string {
  return MEAL_LABELS[meal];
}

export const MEAL_OPTIONS = MEAL_TYPES.map((meal) => ({
  value: meal,
  label: MEAL_LABELS[meal],
}));

const UNIT_LABELS: Record<FoodUnit, string> = {
  G: 'grams',
  ML: 'millilitres',
  PIECE: 'pieces',
  SERVING: 'servings',
  CUP: 'cups',
  TBSP: 'tablespoons',
  TSP: 'teaspoons',
  OZ: 'ounces',
};

export function unitLabel(unit: FoodUnit): string {
  return UNIT_LABELS[unit];
}

const SHORT_UNIT: Record<FoodUnit, string> = {
  G: 'g',
  ML: 'ml',
  PIECE: 'pc',
  SERVING: 'serving',
  CUP: 'cup',
  TBSP: 'tbsp',
  TSP: 'tsp',
  OZ: 'oz',
};

export function formatQuantity(quantity: number, unit: FoodUnit): string {
  return `${oneDecimal.format(quantity)} ${SHORT_UNIT[unit]}`;
}
