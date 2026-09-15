/**
 * Top-level keys only. Mutations invalidate a whole family rather than guessing
 * which filtered list a change affects, which keeps cache invalidation honest.
 */
export const queryKeys = {
  entries: ['entries'],
  goals: ['goals'],
  weights: ['weights'],
  reports: ['reports'],
} as const;

/** Every key a write to food entries can affect. */
export const ENTRY_DEPENDENTS = [queryKeys.entries, queryKeys.reports];

/** Goals feed the goal lines in reports as well as the goals page. */
export const GOAL_DEPENDENTS = [queryKeys.goals, queryKeys.reports];

export const WEIGHT_DEPENDENTS = [queryKeys.weights, queryKeys.reports];
