import {
  buildPageMeta,
  type DateOnly,
  type Goal,
  type GoalUpdate,
  type PageMeta,
  type PaginationQuery,
  toDateOnly,
  toDbDate,
  todayDateOnly,
} from '@tracker/shared';
import { AppError } from '../../common/errors';
import { goalsDao } from './goals.dao';

type GoalRow = {
  id: string;
  dailyCalories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  targetWeightKg: number | null;
  effectiveFrom: Date;
};

function toResponse(goal: GoalRow): Goal {
  return {
    id: goal.id,
    dailyCalories: goal.dailyCalories,
    proteinG: goal.proteinG,
    carbsG: goal.carbsG,
    fatG: goal.fatG,
    targetWeightKg: goal.targetWeightKg,
    effectiveFrom: toDateOnly(goal.effectiveFrom),
  };
}

/**
 * A change is a new version layered on the one already in force, so the client
 * sends only what moved. The very first goal has nothing to inherit from, so it
 * has to supply the four targets.
 */
function mergeOntoCurrent(input: GoalUpdate, current: GoalRow | null) {
  const dailyCalories = input.dailyCalories ?? current?.dailyCalories;
  const proteinG = input.proteinG ?? current?.proteinG;
  const carbsG = input.carbsG ?? current?.carbsG;
  const fatG = input.fatG ?? current?.fatG;

  if (
    dailyCalories === undefined ||
    proteinG === undefined ||
    carbsG === undefined ||
    fatG === undefined
  ) {
    throw AppError.validation(
      'A first goal must set dailyCalories, proteinG, carbsG and fatG',
    );
  }

  // An explicit null clears the weight target, so undefined is the only
  // "leave it alone" value.
  const targetWeightKg =
    input.targetWeightKg !== undefined ? input.targetWeightKg : (current?.targetWeightKg ?? null);

  return { dailyCalories, proteinG, carbsG, fatG, targetWeightKg };
}

export type ResolvedGoal = {
  goal: Goal | null;
  /**
   * True when the day predates every goal the user set, so this is their
   * earliest goal standing in as a baseline rather than a target that was
   * really active.
   */
  isBaseline: boolean;
};

export type GoalResolver = (day: DateOnly) => ResolvedGoal;

export const goalsService = {
  async setGoal(userId: string, input: GoalUpdate): Promise<Goal> {
    const effectiveFrom = input.effectiveFrom ?? todayDateOnly();
    const current = await goalsDao.findActiveOn(userId, toDbDate(effectiveFrom));
    const targets = mergeOntoCurrent(input, current);

    const saved = await goalsDao.saveVersion({
      userId,
      effectiveFrom: toDbDate(effectiveFrom),
      ...targets,
    });

    return toResponse(saved);
  },

  async getActiveOn(userId: string, on?: DateOnly): Promise<Goal> {
    const day = on ?? todayDateOnly();
    const goal = await goalsDao.findActiveOn(userId, toDbDate(day));

    if (!goal) {
      throw AppError.notFound(`No goal is in force on ${day}`);
    }

    return toResponse(goal);
  },

  async list(userId: string, page: PaginationQuery): Promise<{ data: Goal[]; meta: PageMeta }> {
    const [rows, total] = await goalsDao.listPage(userId, page);

    return { data: rows.map(toResponse), meta: buildPageMeta(total, page) };
  },

  /**
   * One query up front, then resolution in memory. A user has a handful of
   * versions, so this beats a correlated subquery per bucket in a report.
   */
  async buildResolver(userId: string): Promise<GoalResolver> {
    const goals = (await goalsDao.listAll(userId)).map(toResponse);

    return (day) => {
      const earliest = goals[0];

      if (!earliest) {
        return { goal: null, isBaseline: false };
      }

      let active: Goal | undefined;

      for (const goal of goals) {
        if (goal.effectiveFrom > day) {
          break;
        }
        active = goal;
      }

      if (active) {
        return { goal: active, isBaseline: false };
      }

      return { goal: earliest, isBaseline: true };
    };
  },
};
