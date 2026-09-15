import {
  addDays,
  type DateOnly,
  eachDay,
  eachWeek,
  type GroupBy,
  type NutritionTotals,
} from '@tracker/shared';
import type { GoalResolver } from '../goals';

export type DayTotals = NutritionTotals & { entries: number };

export const EMPTY_TOTALS: DayTotals = {
  calories: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  entries: 0,
};

/** Float sums drift, so every number leaving a report is rounded. */
export function round(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundTotals(totals: NutritionTotals): NutritionTotals {
  return {
    calories: round(totals.calories),
    proteinG: round(totals.proteinG),
    carbsG: round(totals.carbsG),
    fatG: round(totals.fatG),
  };
}

export type Bucket = {
  bucket: DateOnly;
  days: DateOnly[];
};

/**
 * Day buckets, or Monday-started week buckets clipped to the range. Buckets are
 * built from the range rather than from the rows, so days with no entries still
 * appear and charts have no gaps.
 */
export function buildBuckets(from: DateOnly, to: DateOnly, groupBy: GroupBy): Bucket[] {
  if (groupBy === 'day') {
    return eachDay(from, to).map((day) => ({ bucket: day, days: [day] }));
  }

  return eachWeek(from, to).map((week) => ({
    bucket: week,
    days: eachDay(week, addDays(week, 6)).filter((day) => day >= from && day <= to),
  }));
}

export function sumDays(byDay: Map<DateOnly, DayTotals>, days: DateOnly[]): DayTotals {
  return days.reduce<DayTotals>((total, day) => {
    const dayTotals = byDay.get(day) ?? EMPTY_TOTALS;

    return {
      calories: total.calories + dayTotals.calories,
      proteinG: total.proteinG + dayTotals.proteinG,
      carbsG: total.carbsG + dayTotals.carbsG,
      fatG: total.fatG + dayTotals.fatG,
      entries: total.entries + dayTotals.entries,
    };
  }, EMPTY_TOTALS);
}

export type BucketGoal = NutritionTotals & { isBaseline: boolean };

/**
 * A bucket's target is the sum of the daily targets for the days it covers, so a
 * goal changing mid-week still compares correctly. Returns null when the user had
 * no goal at all.
 */
export function sumGoals(resolve: GoalResolver, days: DateOnly[]): BucketGoal | null {
  let calories = 0;
  let proteinG = 0;
  let carbsG = 0;
  let fatG = 0;
  let covered = 0;
  let baselineDays = 0;

  for (const day of days) {
    const { goal, isBaseline } = resolve(day);

    if (!goal) {
      continue;
    }

    calories += goal.dailyCalories;
    proteinG += goal.proteinG;
    carbsG += goal.carbsG;
    fatG += goal.fatG;
    covered += 1;

    if (isBaseline) {
      baselineDays += 1;
    }
  }

  if (covered === 0) {
    return null;
  }

  // Flag the bucket if any part of it leans on the baseline, so the chart never
  // presents a stand-in target as a real one.
  return { calories, proteinG, carbsG, fatG, isBaseline: baselineDays > 0 };
}

export type Comparison = {
  goal: number | null;
  actual: number;
  diff: number | null;
  percent: number | null;
};

export function compare(goal: number | null, actual: number): Comparison {
  if (goal === null || goal === 0) {
    return { goal, actual: round(actual), diff: null, percent: null };
  }

  return {
    goal: round(goal),
    actual: round(actual),
    diff: round(actual - goal),
    percent: round((actual / goal) * 100),
  };
}

/** Share of calories contributed by each macro, at 4/4/9 kcal per gram. */
export function macroShares(totals: NutritionTotals): {
  proteinPercent: number;
  carbsPercent: number;
  fatPercent: number;
} {
  const fromMacros = totals.proteinG * 4 + totals.carbsG * 4 + totals.fatG * 9;

  if (fromMacros === 0) {
    return { proteinPercent: 0, carbsPercent: 0, fatPercent: 0 };
  }

  return {
    proteinPercent: round(((totals.proteinG * 4) / fromMacros) * 100),
    carbsPercent: round(((totals.carbsG * 4) / fromMacros) * 100),
    fatPercent: round(((totals.fatG * 9) / fromMacros) * 100),
  };
}
