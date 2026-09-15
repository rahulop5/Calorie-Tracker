import { type PaginationQuery, toSkipTake } from '@tracker/shared';
import { prisma } from '../../db';

type GoalVersion = {
  userId: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  targetWeightKg: number | null;
  effectiveFrom: Date;
};

export const goalsDao = {
  /** The version in force on a date: the latest one starting on or before it. */
  findActiveOn(userId: string, on: Date) {
    return prisma.goal.findFirst({
      where: { userId, effectiveFrom: { lte: on } },
      orderBy: { effectiveFrom: 'desc' },
    });
  },

  /** Ascending, so the resolver can walk forwards and the first row is the baseline. */
  listAll(userId: string) {
    return prisma.goal.findMany({
      where: { userId },
      orderBy: { effectiveFrom: 'asc' },
    });
  },

  listPage(userId: string, page: PaginationQuery) {
    return prisma.$transaction([
      prisma.goal.findMany({
        where: { userId },
        orderBy: { effectiveFrom: 'desc' },
        ...toSkipTake(page),
      }),
      prisma.goal.count({ where: { userId } }),
    ]);
  },

  /** Upsert, because posting twice for one day replaces that day's version. */
  saveVersion(version: GoalVersion) {
    const { userId, effectiveFrom, ...targets } = version;

    return prisma.goal.upsert({
      where: { userId_effectiveFrom: { userId, effectiveFrom } },
      create: version,
      update: targets,
    });
  },
};
