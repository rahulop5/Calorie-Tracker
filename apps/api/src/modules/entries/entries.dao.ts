import type { Prisma } from '@prisma/client';
import {
  type EntrySort,
  type EntrySource,
  type FoodUnit,
  type MealType,
  type PaginationQuery,
  toSkipTake,
} from '@tracker/shared';
import { prisma } from '../../db';

export type EntryData = {
  entryDate: Date;
  mealType: MealType;
  foodName: string;
  quantity: number;
  unit: FoodUnit;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  micros: Prisma.InputJsonValue;
  source: EntrySource;
};

export type EntryFilter = {
  userId: string;
  from: Date;
  to: Date;
  mealType?: MealType;
  search?: string;
};

// Every sort ends on `id`. Without a unique final key, offset pagination can
// repeat or skip rows whose sort values tie.
const ORDER_BY: Record<EntrySort, Prisma.FoodEntryOrderByWithRelationInput[]> = {
  'entryDate:desc': [{ entryDate: 'desc' }, { mealType: 'asc' }, { id: 'asc' }],
  'entryDate:asc': [{ entryDate: 'asc' }, { mealType: 'asc' }, { id: 'asc' }],
  'calories:desc': [{ calories: 'desc' }, { id: 'asc' }],
  'calories:asc': [{ calories: 'asc' }, { id: 'asc' }],
};

function buildWhere(filter: EntryFilter): Prisma.FoodEntryWhereInput {
  return {
    userId: filter.userId,
    entryDate: { gte: filter.from, lte: filter.to },
    ...(filter.mealType ? { mealType: filter.mealType } : {}),
    ...(filter.search
      ? { foodName: { contains: filter.search, mode: 'insensitive' } }
      : {}),
  };
}

export const entriesDao = {
  create(userId: string, data: EntryData) {
    return prisma.foodEntry.create({ data: { userId, ...data } });
  },

  /** One statement in one transaction, so a rejected batch writes nothing. */
  createMany(userId: string, rows: EntryData[]) {
    return prisma.foodEntry.createMany({
      data: rows.map((row) => ({ userId, ...row })),
    });
  },

  /** Scoped by userId so one user cannot reach another's row by id. */
  findById(userId: string, id: string) {
    return prisma.foodEntry.findFirst({ where: { id, userId } });
  },

  update(id: string, data: Partial<EntryData>) {
    return prisma.foodEntry.update({ where: { id }, data });
  },

  /** The client extension blocks a real delete on this model. */
  softDelete(id: string) {
    return prisma.foodEntry.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  listPage(filter: EntryFilter, sort: EntrySort, page: PaginationQuery) {
    const where = buildWhere(filter);

    return prisma.$transaction([
      prisma.foodEntry.findMany({ where, orderBy: ORDER_BY[sort], ...toSkipTake(page) }),
      prisma.foodEntry.count({ where }),
    ]);
  },
};
