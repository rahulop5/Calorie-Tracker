import { Prisma } from '@prisma/client';

/**
 * Models that use `deletedAt` instead of real deletes. Entries can be removed by
 * the chat assistant and conversations by the user, so both need an undo path.
 *
 * Reads are the risk: one report query missing `deletedAt: null` would silently
 * put deleted food back into a chart. This extension adds the filter for every
 * model in the set, so a DAO cannot forget it.
 *
 * Known limit: only top-level operations pass through here. A nested `include`
 * is not filtered, so read these models directly rather than through a relation.
 */
const SOFT_DELETE_MODELS = new Set(['FoodEntry', 'Conversation']);

/** Operations that accept a `where` and must only see live rows. */
const FILTERED_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
]);

/**
 * `delete` would bypass the soft delete. `findUnique` cannot take a non-unique
 * filter, so it would read deleted rows. Both are blocked with a message that
 * says what to use instead.
 */
const BLOCKED_OPERATIONS = new Set([
  'delete',
  'deleteMany',
  'findUnique',
  'findUniqueOrThrow',
]);

type ArgsWithWhere = { where?: Record<string, unknown> };

export const softDeleteExtension = Prisma.defineExtension({
  name: 'softDelete',
  query: {
    $allModels: {
      $allOperations({ model, operation, args, query }) {
        if (!SOFT_DELETE_MODELS.has(model)) {
          return query(args);
        }

        if (BLOCKED_OPERATIONS.has(operation)) {
          throw new Error(
            `${model}.${operation}() is blocked because ${model} uses soft delete. ` +
              'Read with findFirst, and remove by setting deletedAt.',
          );
        }

        if (!FILTERED_OPERATIONS.has(operation)) {
          return query(args);
        }

        const { where, ...rest } = args as ArgsWithWhere;
        const liveOnly = { ...rest, where: { ...where, deletedAt: null } };

        return query(liveOnly as typeof args);
      },
    },
  },
});
