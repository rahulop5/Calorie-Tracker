// Shared bounds. Request validation and the AI post-checks both read these,
// so a limit is defined once.

export const LIMITS = {
  foodNameMaxLength: 120,

  entryMaxQuantity: 10_000,
  entryMaxCalories: 10_000,
  entryMaxMacroGrams: 2_000,

  goalMaxCalories: 20_000,
  goalMaxMacroGrams: 1_000,

  weightMinKg: 20,
  weightMaxKg: 500,

  bulkEntryMaxCount: 200,

  pageSizeDefault: 20,
  pageSizeMax: 100,

  // Used when a list request omits from/to.
  defaultRangeDays: 7,
  // Reports sum micronutrients in memory, so the window has to be bounded.
  reportMaxRangeDays: 366,
} as const;
