import { describe, expect, it } from 'vitest';
import { caloriesFromMacros, macroCalorieGap } from '../src/domain/nutrition';

const label = { calories: 310, proteinG: 12.5, carbsG: 48, fatG: 7.2 };

describe('caloriesFromMacros', () => {
  it('uses 4/4/9 kcal per gram', () => {
    expect(caloriesFromMacros(label)).toBe(12.5 * 4 + 48 * 4 + 7.2 * 9);
  });

  it('is zero when there are no macros', () => {
    expect(caloriesFromMacros({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 })).toBe(0);
  });
});

describe('macroCalorieGap', () => {
  it('stays small for a realistic label', () => {
    expect(macroCalorieGap(label)).toBeLessThan(0.25);
  });

  it('is large when the stated calories do not match the macros', () => {
    expect(macroCalorieGap({ ...label, calories: 1200 })).toBeGreaterThan(0.5);
  });

  it('does not divide by zero', () => {
    expect(macroCalorieGap({ calories: 100, proteinG: 0, carbsG: 0, fatG: 0 })).toBe(0);
  });
});
