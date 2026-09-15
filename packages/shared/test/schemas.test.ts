import { describe, expect, it } from 'vitest';
import { registerInputSchema } from '../src/schemas/auth';
import { dateOnlySchema } from '../src/schemas/common';
import { entryInputSchema, entryUpdateSchema } from '../src/schemas/entry';
import { microsSchema } from '../src/schemas/nutrition';

const validEntry = {
  entryDate: '2026-09-13',
  mealType: 'BREAKFAST',
  foodName: '  Oats with milk  ',
  quantity: 200,
  unit: 'G',
  calories: 310,
  proteinG: 12.5,
  carbsG: 48,
  fatG: 7.2,
};

describe('microsSchema', () => {
  it('accepts known keys', () => {
    expect(microsSchema.safeParse({ vitamin_c_mg: 12, fiber_g: 3 }).success).toBe(true);
  });

  it('rejects a key the model invented', () => {
    expect(microsSchema.safeParse({ vitaminC: 12 }).success).toBe(false);
  });

  it('rejects negative amounts', () => {
    expect(microsSchema.safeParse({ iron_mg: -1 }).success).toBe(false);
  });

  it('accepts an empty object', () => {
    expect(microsSchema.parse({})).toEqual({});
  });
});

describe('entryInputSchema', () => {
  it('trims the food name and defaults micros', () => {
    const parsed = entryInputSchema.parse(validEntry);

    expect(parsed.foodName).toBe('Oats with milk');
    expect(parsed.micros).toEqual({});
  });

  it('keeps the entry date as a plain string', () => {
    expect(entryInputSchema.parse(validEntry).entryDate).toBe('2026-09-13');
  });

  it('rejects a timestamp where a date belongs', () => {
    const result = entryInputSchema.safeParse({
      ...validEntry,
      entryDate: '2026-09-13T08:30:00Z',
    });

    expect(result.success).toBe(false);
  });

  it('rejects an unknown meal type', () => {
    expect(entryInputSchema.safeParse({ ...validEntry, mealType: 'BRUNCH' }).success).toBe(false);
  });

  it('rejects a zero or negative quantity', () => {
    expect(entryInputSchema.safeParse({ ...validEntry, quantity: 0 }).success).toBe(false);
  });

  it('rejects an implausible calorie count', () => {
    expect(entryInputSchema.safeParse({ ...validEntry, calories: 99_999 }).success).toBe(false);
  });

  it('requires macros, which is what sends a blank form to the estimator', () => {
    const { proteinG, ...withoutProtein } = validEntry;

    expect(entryInputSchema.safeParse(withoutProtein).success).toBe(false);
  });
});

describe('entryUpdateSchema', () => {
  it('leaves micros absent when the patch does not mention it', () => {
    // Regression: `.partial()` does not strip a `.default()`, so building the
    // patch schema from the input schema made micros fill in as {} and wipe the
    // stored values.
    const parsed = entryUpdateSchema.parse({ quantity: 300 });

    expect(Object.keys(parsed)).toEqual(['quantity']);
  });

  it('rejects a patch with no fields', () => {
    expect(entryUpdateSchema.safeParse({}).success).toBe(false);
  });

  it('still accepts micros when sent explicitly', () => {
    expect(entryUpdateSchema.parse({ micros: { iron_mg: 4 } }).micros).toEqual({ iron_mg: 4 });
  });
});

describe('dateOnlySchema', () => {
  it('accepts YYYY-MM-DD', () => {
    expect(dateOnlySchema.safeParse('2026-09-13').success).toBe(true);
  });

  it('rejects other shapes', () => {
    for (const value of ['13-09-2026', '2026-9-3', '2026-09-13T00:00:00Z', 'today']) {
      expect(dateOnlySchema.safeParse(value).success).toBe(false);
    }
  });

  it('rejects an impossible date', () => {
    expect(dateOnlySchema.safeParse('2026-02-30').success).toBe(false);
  });
});

describe('registerInputSchema', () => {
  const base = { email: '  Demo@Example.COM ', password: 'correct-horse', name: '  Demo  ' };

  it('trims and lowercases the email', () => {
    expect(registerInputSchema.parse(base).email).toBe('demo@example.com');
  });

  it('trims the name', () => {
    expect(registerInputSchema.parse(base).name).toBe('Demo');
  });

  it('rejects a short password', () => {
    expect(registerInputSchema.safeParse({ ...base, password: 'short' }).success).toBe(false);
  });

  it('rejects a malformed email', () => {
    expect(registerInputSchema.safeParse({ ...base, email: 'not-an-email' }).success).toBe(false);
  });
});
