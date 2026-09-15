import { type PaginationQuery, toSkipTake } from '@tracker/shared';
import { prisma } from '../../db';

type DateWindow = { from?: Date; to?: Date };

function buildWhere(userId: string, window: DateWindow) {
  if (!window.from && !window.to) {
    return { userId };
  }

  return {
    userId,
    measuredOn: {
      ...(window.from ? { gte: window.from } : {}),
      ...(window.to ? { lte: window.to } : {}),
    },
  };
}

export const weightsDao = {
  /** Upsert, because a second weigh-in on one day is a correction. */
  save(userId: string, measuredOn: Date, weightKg: number) {
    return prisma.weightLog.upsert({
      where: { userId_measuredOn: { userId, measuredOn } },
      create: { userId, measuredOn, weightKg },
      update: { weightKg },
    });
  },

  findLatest(userId: string) {
    return prisma.weightLog.findFirst({
      where: { userId },
      orderBy: { measuredOn: 'desc' },
    });
  },

  /** Scoped by userId so one user cannot reach another's row by id. */
  findById(userId: string, id: string) {
    return prisma.weightLog.findFirst({ where: { id, userId } });
  },

  deleteById(id: string) {
    return prisma.weightLog.delete({ where: { id } });
  },

  listPage(userId: string, window: DateWindow, page: PaginationQuery) {
    const where = buildWhere(userId, window);

    return prisma.$transaction([
      prisma.weightLog.findMany({
        where,
        orderBy: [{ measuredOn: 'desc' }, { id: 'asc' }],
        ...toSkipTake(page),
      }),
      prisma.weightLog.count({ where }),
    ]);
  },

  listInRange(userId: string, from: Date, to: Date) {
    return prisma.weightLog.findMany({
      where: { userId, measuredOn: { gte: from, lte: to } },
      orderBy: { measuredOn: 'asc' },
    });
  },
};
