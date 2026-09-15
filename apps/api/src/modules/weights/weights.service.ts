import {
  buildPageMeta,
  type PageMeta,
  toDateOnly,
  toDbDate,
  todayDateOnly,
  type WeightListQuery,
  type WeightLog,
  type WeightLogInput,
} from '@tracker/shared';
import { AppError } from '../../common/errors';
import { weightsDao } from './weights.dao';

type WeightRow = {
  id: string;
  measuredOn: Date;
  weightKg: number;
};

function toResponse(row: WeightRow): WeightLog {
  return {
    id: row.id,
    measuredOn: toDateOnly(row.measuredOn),
    weightKg: row.weightKg,
  };
}

export const weightsService = {
  async record(userId: string, input: WeightLogInput): Promise<WeightLog> {
    const measuredOn = input.measuredOn ?? todayDateOnly();
    const saved = await weightsDao.save(userId, toDbDate(measuredOn), input.weightKg);

    return toResponse(saved);
  },

  async getLatest(userId: string): Promise<WeightLog> {
    const row = await weightsDao.findLatest(userId);

    if (!row) {
      throw AppError.notFound('No weight has been logged yet');
    }

    return toResponse(row);
  },

  async list(
    userId: string,
    query: WeightListQuery,
  ): Promise<{ data: WeightLog[]; meta: PageMeta }> {
    const window = {
      from: query.from ? toDbDate(query.from) : undefined,
      to: query.to ? toDbDate(query.to) : undefined,
    };

    const [rows, total] = await weightsDao.listPage(userId, window, query);

    return { data: rows.map(toResponse), meta: buildPageMeta(total, query) };
  },

  async remove(userId: string, id: string): Promise<void> {
    const existing = await weightsDao.findById(userId, id);

    if (!existing) {
      throw AppError.notFound('Weight entry not found');
    }

    await weightsDao.deleteById(id);
  },
};
