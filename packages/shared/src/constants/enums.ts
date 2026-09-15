// These mirror the Prisma enums. They are duplicated here because the web app
// imports this package and cannot depend on the Prisma client.

export const MEAL_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'SNACK'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const FOOD_UNITS = ['G', 'ML', 'PIECE', 'SERVING', 'CUP', 'TBSP', 'TSP', 'OZ'] as const;
export type FoodUnit = (typeof FOOD_UNITS)[number];

// How an entry got created. Set by the server, shown as provenance in the UI.
// AI_ESTIMATE means the user typed a food name and the model filled the numbers.
export const ENTRY_SOURCES = ['MANUAL', 'IMAGE', 'PDF', 'CHAT', 'AI_ESTIMATE'] as const;
export type EntrySource = (typeof ENTRY_SOURCES)[number];

export const CHAT_ROLES = ['USER', 'ASSISTANT'] as const;
export type ChatRole = (typeof CHAT_ROLES)[number];
