import { prisma } from '../../db';

// Aggregation lives here rather than in the entries DAO: same table, different
// concern. Sums are computed by Postgres, and the soft-delete extension adds
// `deletedAt: null` to every one of these, so deleted food never reaches a chart.

const NUTRITION_SUMS = {
  calories: true,
  proteinG: true,
  carbsG: true,
  fatG: true,
} as const;

export const reportsDao = {
  sumByDay(userId: string, from: Date, to: Date) {
    return prisma.foodEntry.groupBy({
      by: ['entryDate'],
      where: { userId, entryDate: { gte: from, lte: to } },
      _sum: NUTRITION_SUMS,
      _count: { _all: true },
    });
  },

  sumByMealType(userId: string, from: Date, to: Date) {
    return prisma.foodEntry.groupBy({
      by: ['mealType'],
      where: { userId, entryDate: { gte: from, lte: to } },
      _sum: NUTRITION_SUMS,
      _count: { _all: true },
    });
  },

  sumRange(userId: string, from: Date, to: Date) {
    return prisma.foodEntry.aggregate({
      where: { userId, entryDate: { gte: from, lte: to } },
      _sum: NUTRITION_SUMS,
      _count: { _all: true },
    });
  },

  /** Micronutrients are JSONB, so they are summed in memory. */
  listMicros(userId: string, from: Date, to: Date) {
    return prisma.foodEntry.findMany({
      where: { userId, entryDate: { gte: from, lte: to } },
      select: { micros: true },
    });
  },
};
