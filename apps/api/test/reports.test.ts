import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEntry, createGoal, createTestApp, registerUser } from './helpers/app';

const REPORTS = '/api/v1/reports';
const RANGE = 'from=2026-09-07&to=2026-09-13';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

type User = Awaited<ReturnType<typeof registerUser>>;

function get(url: string, user: User) {
  return app.inject({ method: 'GET', url, headers: user.headers });
}

/** Two days of food inside the 7th-to-13th window, plus a goal covering it. */
async function seedWeek(): Promise<User> {
  const user = await registerUser(app);

  await createGoal(app, user, {
    dailyCalories: 2000,
    proteinG: 100,
    carbsG: 200,
    fatG: 60,
    targetWeightKg: 72,
    effectiveFrom: '2026-09-01',
  });

  await createEntry(app, user, {
    entryDate: '2026-09-07',
    mealType: 'BREAKFAST',
    calories: 500,
    proteinG: 30,
    carbsG: 50,
    fatG: 10,
    micros: { fiber_g: 5, iron_mg: 9 },
  });
  await createEntry(app, user, {
    entryDate: '2026-09-07',
    mealType: 'LUNCH',
    calories: 700,
    proteinG: 40,
    carbsG: 70,
    fatG: 20,
    micros: { fiber_g: 3 },
  });
  await createEntry(app, user, {
    entryDate: '2026-09-08',
    mealType: 'DINNER',
    calories: 800,
    proteinG: 50,
    carbsG: 80,
    fatG: 25,
    micros: { iron_mg: 9 },
  });

  return user;
}

describe('summary', () => {
  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: `${REPORTS}/summary?${RANGE}` });

    expect(response.statusCode).toBe(401);
  });

  it('totals the range and averages over every day in it', async () => {
    const user = await seedWeek();

    const body = (await get(`${REPORTS}/summary?${RANGE}`, user)).json();

    expect(body.days).toBe(7);
    expect(body.entries).toBe(3);
    expect(body.totals).toEqual({ calories: 2000, proteinG: 120, carbsG: 200, fatG: 55 });
    // Averaged across all 7 days, not just the 2 with food.
    expect(body.dailyAverage.calories).toBe(285.71);
    expect(body.goal.dailyCalories).toBe(2000);
    expect(body.goalIsBaseline).toBe(false);
  });

  it('reports zeroes and no goal for a user with nothing', async () => {
    const user = await registerUser(app);

    const body = (await get(`${REPORTS}/summary?${RANGE}`, user)).json();

    expect(body.totals).toEqual({ calories: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    expect(body.goal).toBeNull();
    expect(body.goalIsBaseline).toBe(false);
  });

  it('excludes a deleted entry', async () => {
    const user = await seedWeek();
    const list = await get(`/api/v1/entries?${RANGE}`, user);
    const victim = list.json().data[0];

    await app.inject({
      method: 'DELETE',
      url: `/api/v1/entries/${victim.id}`,
      headers: user.headers,
    });

    const body = (await get(`${REPORTS}/summary?${RANGE}`, user)).json();

    expect(body.entries).toBe(2);
    expect(body.totals.calories).toBe(2000 - victim.calories);
  });

  it('rejects a range longer than the limit', async () => {
    const user = await registerUser(app);

    const response = await get(`${REPORTS}/summary?from=2020-01-01&to=2026-01-01`, user);

    expect(response.statusCode).toBe(400);
  });

  it('requires both ends of the range', async () => {
    const user = await registerUser(app);

    expect((await get(`${REPORTS}/summary?from=2026-09-07`, user)).statusCode).toBe(400);
  });
});

describe('calories', () => {
  it('returns one point per day, zero-filling the empty ones', async () => {
    const user = await seedWeek();

    const body = (await get(`${REPORTS}/calories?${RANGE}`, user)).json();

    expect(body.meta.total).toBe(7);
    expect(body.data[0]).toEqual({
      bucket: '2026-09-07',
      calories: 1200,
      goalCalories: 2000,
      goalIsBaseline: false,
    });
    // A day with no food still appears, so the chart has no gap.
    expect(body.data[2]).toMatchObject({ bucket: '2026-09-09', calories: 0 });
  });

  it('groups by week, summing the daily goals in the bucket', async () => {
    const user = await seedWeek();

    const body = (await get(`${REPORTS}/calories?${RANGE}&groupBy=week`, user)).json();

    expect(body.meta.total).toBe(1);
    expect(body.data[0]).toMatchObject({
      bucket: '2026-09-07',
      calories: 2000,
      // 7 days at 2000 each.
      goalCalories: 14_000,
    });
  });

  it('pages over the series', async () => {
    const user = await seedWeek();

    const body = (await get(`${REPORTS}/calories?${RANGE}&pageSize=3&page=2`, user)).json();

    expect(body.data).toHaveLength(3);
    expect(body.data[0].bucket).toBe('2026-09-10');
    expect(body.meta).toMatchObject({ total: 7, totalPages: 3, hasNext: true });
  });

  it('leaves the goal null when the user never set one', async () => {
    const user = await registerUser(app);
    await createEntry(app, user, { entryDate: '2026-09-07', calories: 500 });

    const body = (await get(`${REPORTS}/calories?${RANGE}`, user)).json();

    expect(body.data[0]).toMatchObject({ goalCalories: null, goalIsBaseline: false });
  });

  it('falls back to the earliest goal and flags it as a baseline', async () => {
    const user = await registerUser(app);
    await createGoal(app, user, { dailyCalories: 2000, effectiveFrom: '2026-10-01' });
    await createEntry(app, user, { entryDate: '2026-09-07', calories: 500 });

    const body = (await get(`${REPORTS}/calories?${RANGE}`, user)).json();

    // The food predates the goal, so the comparison is a stand-in and says so.
    expect(body.data[0]).toMatchObject({ goalCalories: 2000, goalIsBaseline: true });
  });
});

describe('macros', () => {
  it('reports grams and the share of calories from each macro', async () => {
    const user = await seedWeek();

    const body = (await get(`${REPORTS}/macros?${RANGE}`, user)).json();
    const day = body.data[0];

    expect(day).toMatchObject({ bucket: '2026-09-07', proteinG: 70, carbsG: 120, fatG: 30 });

    // 70*4 + 120*4 + 30*9 = 1030 kcal from macros.
    expect(day.proteinPercent).toBe(27.18);
    expect(day.carbsPercent).toBe(46.6);
    expect(day.fatPercent).toBe(26.21);
    expect(day.proteinPercent + day.carbsPercent + day.fatPercent).toBeCloseTo(100, 1);
  });

  it('reports zero shares for an empty day rather than dividing by zero', async () => {
    const user = await seedWeek();

    const body = (await get(`${REPORTS}/macros?${RANGE}`, user)).json();

    expect(body.data[2]).toMatchObject({
      bucket: '2026-09-09',
      proteinPercent: 0,
      carbsPercent: 0,
      fatPercent: 0,
    });
  });
});

describe('goal vs actual', () => {
  it('compares each macro against the goal for the day', async () => {
    const user = await seedWeek();

    const body = (await get(`${REPORTS}/goal-vs-actual?${RANGE}`, user)).json();

    expect(body.data[0]).toMatchObject({
      bucket: '2026-09-07',
      goalIsBaseline: false,
      calories: { goal: 2000, actual: 1200, diff: -800, percent: 60 },
      proteinG: { goal: 100, actual: 70, diff: -30, percent: 70 },
    });
  });

  it('nulls the comparison when there is no goal', async () => {
    const user = await registerUser(app);
    await createEntry(app, user, { entryDate: '2026-09-07', calories: 500 });

    const body = (await get(`${REPORTS}/goal-vs-actual?${RANGE}`, user)).json();

    expect(body.data[0].calories).toEqual({
      goal: null,
      actual: 500,
      diff: null,
      percent: null,
    });
  });
});

describe('micros', () => {
  it('sums the range and compares the daily average to the reference value', async () => {
    const user = await seedWeek();

    const body = (await get(`${REPORTS}/micros?${RANGE}`, user)).json();
    const items = new Map(body.items.map((item: { key: string }) => [item.key, item]));

    expect(body.days).toBe(7);
    expect(items.get('fiber_g')).toMatchObject({
      label: 'Fiber',
      unit: 'g',
      total: 8,
      dailyAverage: 1.14,
      dailyValue: 28,
    });
    expect(items.get('iron_mg')).toMatchObject({ total: 18, dailyAverage: 2.57 });
  });

  it('includes nutrients with nothing logged, which is the point of the report', async () => {
    const user = await seedWeek();

    const body = (await get(`${REPORTS}/micros?${RANGE}`, user)).json();
    const vitaminD = body.items.find((item: { key: string }) => item.key === 'vitamin_d_mcg');

    expect(vitaminD).toMatchObject({ total: 0, percentOfDailyValue: 0 });
  });

  it('leaves the percentage null where no reference value exists', async () => {
    const user = await seedWeek();

    const body = (await get(`${REPORTS}/micros?${RANGE}`, user)).json();
    const transFat = body.items.find((item: { key: string }) => item.key === 'trans_fat_g');

    expect(transFat).toMatchObject({ dailyValue: null, percentOfDailyValue: null });
  });
});

describe('meal breakdown', () => {
  it('returns all four meals with their share of calories', async () => {
    const user = await seedWeek();

    const body = (await get(`${REPORTS}/meal-breakdown?${RANGE}`, user)).json();
    const byMeal = new Map(body.items.map((item: { mealType: string }) => [item.mealType, item]));

    expect(body.items).toHaveLength(4);
    expect(byMeal.get('BREAKFAST')).toMatchObject({ calories: 500, entries: 1, percentOfCalories: 25 });
    expect(byMeal.get('DINNER')).toMatchObject({ calories: 800, percentOfCalories: 40 });
    // Nothing logged, but the slice still exists so the chart stays stable.
    expect(byMeal.get('SNACK')).toMatchObject({ calories: 0, entries: 0, percentOfCalories: 0 });
  });
});

describe('weight', () => {
  it('pairs each weight with the target in force that day', async () => {
    const user = await seedWeek();
    await app.inject({
      method: 'PUT',
      url: '/api/v1/weights',
      headers: user.headers,
      payload: { weightKg: 74.5, measuredOn: '2026-09-08' },
    });

    const body = (await get(`${REPORTS}/weight?${RANGE}`, user)).json();

    expect(body.meta.total).toBe(1);
    expect(body.data[0]).toEqual({
      measuredOn: '2026-09-08',
      weightKg: 74.5,
      targetWeightKg: 72,
      goalIsBaseline: false,
    });
  });

  it('returns an empty series when nothing was logged', async () => {
    const user = await seedWeek();

    const body = (await get(`${REPORTS}/weight?${RANGE}`, user)).json();

    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
  });
});
