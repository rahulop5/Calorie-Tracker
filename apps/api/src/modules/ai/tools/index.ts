import {
  type EntryUpdate,
  entryInputSchema,
  entryUpdateSchema,
  estimateNutritionInputSchema,
  FOOD_UNITS,
  goalUpdateSchema,
  MEAL_TYPES,
  weightLogInputSchema,
} from '@tracker/shared';
import { z } from 'zod';
import { entriesService } from '../../entries';
import { goalsService } from '../../goals';
import { reportsService } from '../../reports';
import { weightsService } from '../../weights';
import { aiService } from '../ai.service';
import type { ChatTool, ToolCall } from '../provider';

/**
 * Tools are a name, a schema and a call into a service. No business logic lives
 * here, so a new rule in "log a meal" reaches the REST route and the assistant
 * at the same time.
 *
 * The userId is closed over from the verified access token and is never a tool
 * argument, so the model cannot reach another user's data by asking.
 */

const dateOnly = z.iso.date();

const reportTypeSchema = z.enum([
  'summary',
  'calories',
  'macros',
  'micros',
  'goal-vs-actual',
  'meal-breakdown',
]);

const listEntriesSchema = z.object({
  from: dateOnly,
  to: dateOnly,
  mealType: z.enum(MEAL_TYPES).optional(),
});

const reportSchema = z.object({
  type: reportTypeSchema,
  from: dateOnly,
  to: dateOnly,
  groupBy: z.enum(['day', 'week']).default('day'),
});

const entryIdSchema = z.object({ id: z.uuid() });
const updateEntrySchema = z.object({ id: z.uuid(), changes: entryUpdateSchema });

type ToolDefinition = {
  tool: ChatTool;
  run: (input: unknown) => Promise<unknown>;
};

/** Zod to the JSON Schema the Messages API expects, with strict tool use in mind. */
function jsonSchema(schema: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(schema, { io: 'input', target: 'draft-2020-12' }) as Record<
    string,
    unknown
  >;
}

function define<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
  run: (input: z.infer<T>) => Promise<unknown>,
): ToolDefinition {
  return {
    tool: { name, description, inputSchema: jsonSchema(schema) },
    run: async (raw) => {
      // The model's arguments are untrusted input like any other.
      const parsed = schema.safeParse(raw);

      if (!parsed.success) {
        throw new Error(
          parsed.error.issues
            .map((issue) => `${issue.path.join('.') || 'input'}: ${issue.message}`)
            .join('; '),
        );
      }

      return run(parsed.data);
    },
  };
}

export function buildChatTools(userId: string): ToolDefinition[] {
  return [
    define(
      'log_food_entry',
      'Log one food entry for the signed-in user. Only call this once the user has agreed to the numbers.',
      entryInputSchema,
      async (input) => entriesService.create(userId, input, 'CHAT'),
    ),

    define(
      'list_food_entries',
      'List the food entries the user logged in a date range, optionally filtered by meal.',
      listEntriesSchema,
      async (input) => {
        const page = await entriesService.list(userId, {
          from: input.from,
          to: input.to,
          page: 1,
          pageSize: 50,
          sort: 'entryDate:desc',
          ...(input.mealType ? { mealType: input.mealType } : {}),
        });

        return { entries: page.data, total: page.meta.total };
      },
    ),

    define(
      'update_food_entry',
      'Change fields on an existing food entry. Say what you are changing before calling this.',
      updateEntrySchema,
      async (input) => entriesService.update(userId, input.id, input.changes as EntryUpdate),
    ),

    define(
      'delete_food_entry',
      'Delete a food entry. Confirm with the user first. The entry can be restored by support.',
      entryIdSchema,
      async (input) => {
        await entriesService.remove(userId, input.id);

        return { deleted: true, id: input.id };
      },
    ),

    define(
      'get_current_goal',
      "Read the user's nutrition goal that is in force on a date, today by default.",
      z.object({ on: dateOnly.optional() }),
      async (input) => goalsService.getActiveOn(userId, input.on),
    ),

    define(
      'set_goal',
      'Create a new goal version. Only the fields you pass change; the rest carry forward.',
      goalUpdateSchema,
      async (input) => goalsService.setGoal(userId, input),
    ),

    define(
      'record_weight',
      'Record the user\'s weight for a day. Logging the same day again corrects it.',
      weightLogInputSchema,
      async (input) => weightsService.record(userId, input),
    ),

    define(
      'get_nutrition_report',
      'Read a nutrition report: totals, calorie trend, macros, micronutrients, goal vs actual, or a breakdown by meal.',
      reportSchema,
      async (input) => {
        const range = { from: input.from, to: input.to };
        const bucketed = { ...range, groupBy: input.groupBy, page: 1, pageSize: 100 };

        switch (input.type) {
          case 'summary':
            return reportsService.summary(userId, range);
          case 'calories':
            return reportsService.calories(userId, bucketed);
          case 'macros':
            return reportsService.macros(userId, bucketed);
          case 'micros':
            return reportsService.micros(userId, range);
          case 'goal-vs-actual':
            return reportsService.goalVsActual(userId, bucketed);
          case 'meal-breakdown':
            return reportsService.mealBreakdown(userId, range);
        }
      },
    ),

    define(
      'estimate_nutrition',
      'Estimate calories and macros for a named food and quantity. Read-only: it proposes numbers and stores nothing. Use it before log_food_entry when the user gives no numbers.',
      estimateNutritionInputSchema,
      async (input) => aiService.estimate(input),
    ),
  ];
}

export type ChatToolset = {
  tools: ChatTool[];
  runTool: (call: ToolCall) => Promise<{ output: unknown; isError: boolean }>;
};

export function createToolset(userId: string): ChatToolset {
  const definitions = buildChatTools(userId);
  const byName = new Map(definitions.map((definition) => [definition.tool.name, definition]));

  return {
    tools: definitions.map((definition) => definition.tool),

    // A failed tool comes back as a result the model can read and react to,
    // never as a thrown error that would end the conversation.
    async runTool(call) {
      const definition = byName.get(call.name);

      if (!definition) {
        return { output: { error: `Unknown tool ${call.name}` }, isError: true };
      }

      try {
        return { output: await definition.run(call.input), isError: false };
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The tool failed';

        return { output: { error: message }, isError: true };
      }
    },
  };
}
