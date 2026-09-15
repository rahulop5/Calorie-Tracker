import {
  addDays,
  buildPageMeta,
  type BulkEntryResult,
  type Entry,
  type EntryInput,
  type EntryListQuery,
  type EntrySource,
  type EntryUpdate,
  LIMITS,
  type Micros,
  type PageMeta,
  toDateOnly,
  toDbDate,
  todayDateOnly,
} from '@tracker/shared';
import { AppError } from '../../common/errors';
import { type EntryData, entriesDao } from './entries.dao';

type EntryRow = {
  id: string;
  entryDate: Date;
  mealType: Entry['mealType'];
  foodName: string;
  quantity: number;
  unit: Entry['unit'];
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  micros: unknown;
  source: EntrySource;
};

function toResponse(row: EntryRow): Entry {
  return {
    id: row.id,
    entryDate: toDateOnly(row.entryDate),
    mealType: row.mealType,
    foodName: row.foodName,
    quantity: row.quantity,
    unit: row.unit,
    calories: row.calories,
    proteinG: row.proteinG,
    carbsG: row.carbsG,
    fatG: row.fatG,
    // Writes are schema-validated, so the stored JSON is already a valid Micros.
    micros: (row.micros ?? {}) as Micros,
    source: row.source,
  };
}

function toEntryData(input: EntryInput, source: EntrySource): EntryData {
  return {
    entryDate: toDbDate(input.entryDate),
    mealType: input.mealType,
    foodName: input.foodName,
    quantity: input.quantity,
    unit: input.unit,
    calories: input.calories,
    proteinG: input.proteinG,
    carbsG: input.carbsG,
    fatG: input.fatG,
    micros: input.micros,
    source,
  };
}

/** Listing without an explicit window shows the last week. */
function resolveWindow(query: EntryListQuery): { from: string; to: string } {
  const to = query.to ?? todayDateOnly();
  const from = query.from ?? addDays(to, -(LIMITS.defaultRangeDays - 1));

  return { from, to };
}

export const entriesService = {
  async create(userId: string, input: EntryInput, source: EntrySource): Promise<Entry> {
    const created = await entriesDao.create(userId, toEntryData(input, source));

    return toResponse(created);
  },

  async createBulk(
    userId: string,
    inputs: EntryInput[],
    source: EntrySource,
  ): Promise<BulkEntryResult> {
    const rows = inputs.map((input) => toEntryData(input, source));
    const result = await entriesDao.createMany(userId, rows);

    return { created: result.count };
  },

  async get(userId: string, id: string): Promise<Entry> {
    const row = await entriesDao.findById(userId, id);

    if (!row) {
      throw AppError.notFound('Food entry not found');
    }

    return toResponse(row);
  },

  async list(
    userId: string,
    query: EntryListQuery,
  ): Promise<{ data: Entry[]; meta: PageMeta }> {
    const window = resolveWindow(query);

    const [rows, total] = await entriesDao.listPage(
      {
        userId,
        from: toDbDate(window.from),
        to: toDbDate(window.to),
        mealType: query.mealType,
        search: query.search,
      },
      query.sort,
      query,
    );

    return { data: rows.map(toResponse), meta: buildPageMeta(total, query) };
  },

  async update(userId: string, id: string, patch: EntryUpdate): Promise<Entry> {
    const existing = await entriesDao.findById(userId, id);

    if (!existing) {
      throw AppError.notFound('Food entry not found');
    }

    const updated = await entriesDao.update(id, {
      ...(patch.entryDate !== undefined ? { entryDate: toDbDate(patch.entryDate) } : {}),
      ...(patch.mealType !== undefined ? { mealType: patch.mealType } : {}),
      ...(patch.foodName !== undefined ? { foodName: patch.foodName } : {}),
      ...(patch.quantity !== undefined ? { quantity: patch.quantity } : {}),
      ...(patch.unit !== undefined ? { unit: patch.unit } : {}),
      ...(patch.calories !== undefined ? { calories: patch.calories } : {}),
      ...(patch.proteinG !== undefined ? { proteinG: patch.proteinG } : {}),
      ...(patch.carbsG !== undefined ? { carbsG: patch.carbsG } : {}),
      ...(patch.fatG !== undefined ? { fatG: patch.fatG } : {}),
      ...(patch.micros !== undefined ? { micros: patch.micros } : {}),
    });

    return toResponse(updated);
  },

  async remove(userId: string, id: string): Promise<void> {
    const existing = await entriesDao.findById(userId, id);

    if (!existing) {
      throw AppError.notFound('Food entry not found');
    }

    await entriesDao.softDelete(id);
  },
};
