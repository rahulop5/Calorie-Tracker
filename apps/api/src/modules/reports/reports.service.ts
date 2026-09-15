import {
  type BucketedReportQuery,
  buildPageMeta,
  type CaloriePoint,
  countDays,
  type DateOnly,
  type GoalVsActualPoint,
  type MacroPoint,
  type MealBreakdownReport,
  MEAL_TYPES,
  type MicronutrientKey,
  MICRONUTRIENT_KEYS,
  MICRONUTRIENTS,
  type Micros,
  type MicrosReport,
  type PageMeta,
  type ReportRangeQuery,
  type SummaryReport,
  toDateOnly,
  toDbDate,
  toSkipTake,
  type WeightPoint,
} from '@tracker/shared';
import { type GoalResolver, goalsService } from '../goals';
import { weightsDao } from '../weights';
import {
  buildBuckets,
  compare,
  type DayTotals,
  macroShares,
  round,
  roundTotals,
  sumDays,
  sumGoals,
} from './reports.buckets';
import { reportsDao } from './reports.dao';

type Paged<T> = { data: T[]; meta: PageMeta };

/** Reports compute a full series, then page over it. */
function pageOf<T>(items: T[], query: BucketedReportQuery): Paged<T> {
  const { skip, take } = toSkipTake(query);

  return { data: items.slice(skip, skip + take), meta: buildPageMeta(items.length, query) };
}

async function loadDailyTotals(
  userId: string,
  range: ReportRangeQuery,
): Promise<Map<DateOnly, DayTotals>> {
  const rows = await reportsDao.sumByDay(userId, toDbDate(range.from), toDbDate(range.to));
  const byDay = new Map<DateOnly, DayTotals>();

  for (const row of rows) {
    byDay.set(toDateOnly(row.entryDate), {
      calories: row._sum.calories ?? 0,
      proteinG: row._sum.proteinG ?? 0,
      carbsG: row._sum.carbsG ?? 0,
      fatG: row._sum.fatG ?? 0,
      entries: row._count._all,
    });
  }

  return byDay;
}

/** The daily totals and the goal resolver, which every bucketed report needs. */
async function loadSeriesInputs(userId: string, range: ReportRangeQuery) {
  const [byDay, resolveGoal] = await Promise.all([
    loadDailyTotals(userId, range),
    goalsService.buildResolver(userId),
  ]);

  return { byDay, resolveGoal };
}

function sumMicros(rows: { micros: unknown }[]): Map<MicronutrientKey, number> {
  const totals = new Map<MicronutrientKey, number>();

  for (const row of rows) {
    const micros = (row.micros ?? {}) as Micros;

    for (const [key, value] of Object.entries(micros)) {
      if (typeof value !== 'number') {
        continue;
      }

      const microKey = key as MicronutrientKey;
      totals.set(microKey, (totals.get(microKey) ?? 0) + value);
    }
  }

  return totals;
}

export const reportsService = {
  async summary(userId: string, range: ReportRangeQuery): Promise<SummaryReport> {
    const [totals, resolveGoal] = await Promise.all([
      reportsDao.sumRange(userId, toDbDate(range.from), toDbDate(range.to)),
      goalsService.buildResolver(userId),
    ]);

    const days = countDays(range.from, range.to);

    const sums = {
      calories: totals._sum.calories ?? 0,
      proteinG: totals._sum.proteinG ?? 0,
      carbsG: totals._sum.carbsG ?? 0,
      fatG: totals._sum.fatG ?? 0,
    };

    // The headline goal is the one in force at the end of the range.
    const resolved = resolveGoal(range.to);

    return {
      from: range.from,
      to: range.to,
      days,
      entries: totals._count._all,
      totals: roundTotals(sums),
      dailyAverage: roundTotals({
        calories: sums.calories / days,
        proteinG: sums.proteinG / days,
        carbsG: sums.carbsG / days,
        fatG: sums.fatG / days,
      }),
      goal: resolved.goal,
      goalIsBaseline: resolved.isBaseline,
    };
  },

  async calories(userId: string, query: BucketedReportQuery): Promise<Paged<CaloriePoint>> {
    const { byDay, resolveGoal } = await loadSeriesInputs(userId, query);

    const points = buildBuckets(query.from, query.to, query.groupBy).map(({ bucket, days }) => {
      const totals = sumDays(byDay, days);
      const goals = sumGoals(resolveGoal, days);

      return {
        bucket,
        calories: round(totals.calories),
        goalCalories: goals ? round(goals.calories) : null,
        goalIsBaseline: goals?.isBaseline ?? false,
      };
    });

    return pageOf(points, query);
  },

  async macros(userId: string, query: BucketedReportQuery): Promise<Paged<MacroPoint>> {
    const byDay = await loadDailyTotals(userId, query);

    const points = buildBuckets(query.from, query.to, query.groupBy).map(({ bucket, days }) => {
      const totals = sumDays(byDay, days);

      return {
        bucket,
        ...roundTotals(totals),
        ...macroShares(totals),
      };
    });

    return pageOf(points, query);
  },

  async goalVsActual(
    userId: string,
    query: BucketedReportQuery,
  ): Promise<Paged<GoalVsActualPoint>> {
    const { byDay, resolveGoal } = await loadSeriesInputs(userId, query);

    const points = buildBuckets(query.from, query.to, query.groupBy).map(({ bucket, days }) => {
      const totals = sumDays(byDay, days);
      const goals = sumGoals(resolveGoal, days);

      return {
        bucket,
        goalIsBaseline: goals?.isBaseline ?? false,
        calories: compare(goals?.calories ?? null, totals.calories),
        proteinG: compare(goals?.proteinG ?? null, totals.proteinG),
        carbsG: compare(goals?.carbsG ?? null, totals.carbsG),
        fatG: compare(goals?.fatG ?? null, totals.fatG),
      };
    });

    return pageOf(points, query);
  },

  async micros(userId: string, range: ReportRangeQuery): Promise<MicrosReport> {
    const rows = await reportsDao.listMicros(userId, toDbDate(range.from), toDbDate(range.to));
    const totals = sumMicros(rows);
    const days = countDays(range.from, range.to);

    // Every known nutrient is returned, including zeroes: "no vitamin D at all"
    // is exactly what this report exists to show.
    const items = MICRONUTRIENT_KEYS.map((key) => {
      const nutrient = MICRONUTRIENTS[key];
      const total = totals.get(key) ?? 0;
      const dailyAverage = total / days;

      return {
        key,
        label: nutrient.label,
        unit: nutrient.unit,
        total: round(total),
        dailyAverage: round(dailyAverage),
        dailyValue: nutrient.dailyValue,
        percentOfDailyValue: nutrient.dailyValue
          ? round((dailyAverage / nutrient.dailyValue) * 100)
          : null,
      };
    });

    return { from: range.from, to: range.to, days, items };
  },

  async mealBreakdown(userId: string, range: ReportRangeQuery): Promise<MealBreakdownReport> {
    const rows = await reportsDao.sumByMealType(
      userId,
      toDbDate(range.from),
      toDbDate(range.to),
    );

    const byMeal = new Map(rows.map((row) => [row.mealType, row]));
    const totalCalories = rows.reduce((sum, row) => sum + (row._sum.calories ?? 0), 0);

    // All four meals, zero-filled, so the chart keeps a stable set of slices.
    const items = MEAL_TYPES.map((mealType) => {
      const row = byMeal.get(mealType);
      const calories = row?._sum.calories ?? 0;

      return {
        mealType,
        entries: row?._count._all ?? 0,
        ...roundTotals({
          calories,
          proteinG: row?._sum.proteinG ?? 0,
          carbsG: row?._sum.carbsG ?? 0,
          fatG: row?._sum.fatG ?? 0,
        }),
        percentOfCalories: totalCalories === 0 ? 0 : round((calories / totalCalories) * 100),
      };
    });

    return { from: range.from, to: range.to, items };
  },

  async weight(userId: string, query: BucketedReportQuery): Promise<Paged<WeightPoint>> {
    const [rows, resolveGoal] = await Promise.all([
      weightsDao.listInRange(userId, toDbDate(query.from), toDbDate(query.to)),
      goalsService.buildResolver(userId),
    ]);

    const points = rows.map((row) => {
      const measuredOn = toDateOnly(row.measuredOn);
      const { goal, isBaseline } = resolveGoal(measuredOn);

      return {
        measuredOn,
        weightKg: row.weightKg,
        targetWeightKg: goal?.targetWeightKg ?? null,
        goalIsBaseline: isBaseline,
      };
    });

    return pageOf(points, query);
  },
};

export type { GoalResolver };
