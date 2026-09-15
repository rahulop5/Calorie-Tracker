import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A_GOAL, createGoal, createTestApp, registerUser } from './helpers/app';

const GOALS = '/api/v1/goals';
const CURRENT = '/api/v1/goals/current';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('creating goals', () => {
  it('requires authentication', async () => {
    const response = await app.inject({ method: 'GET', url: CURRENT });

    expect(response.statusCode).toBe(401);
  });

  it('creates a first version from a full payload', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: GOALS,
      headers: user.headers,
      payload: { ...A_GOAL, effectiveFrom: '2026-09-01' },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ ...A_GOAL, effectiveFrom: '2026-09-01' });
  });

  it('refuses a partial first goal, because there is nothing to inherit', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: GOALS,
      headers: user.headers,
      payload: { proteinG: 180 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/first goal/i);
  });

  it('merges a partial change onto the version in force', async () => {
    const user = await registerUser(app);
    await createGoal(app, user, { effectiveFrom: '2026-09-01' });

    const response = await app.inject({
      method: 'POST',
      url: GOALS,
      headers: user.headers,
      payload: { proteinG: 180, effectiveFrom: '2026-09-10' },
    });

    expect(response.statusCode).toBe(201);
    // Only protein moved; the rest carried forward.
    expect(response.json()).toMatchObject({
      dailyCalories: A_GOAL.dailyCalories,
      proteinG: 180,
      carbsG: A_GOAL.carbsG,
      fatG: A_GOAL.fatG,
    });
  });

  it('replaces the version for a day instead of duplicating it', async () => {
    const user = await registerUser(app);
    await createGoal(app, user, { effectiveFrom: '2026-09-01' });
    await createGoal(app, user, { dailyCalories: 2500, effectiveFrom: '2026-09-01' });

    const list = await app.inject({ method: 'GET', url: GOALS, headers: user.headers });

    expect(list.json().meta.total).toBe(1);
    expect(list.json().data[0].dailyCalories).toBe(2500);
  });

  it('clears the weight target when sent an explicit null', async () => {
    const user = await registerUser(app);
    await createGoal(app, user, { targetWeightKg: 72, effectiveFrom: '2026-09-01' });

    const response = await app.inject({
      method: 'POST',
      url: GOALS,
      headers: user.headers,
      payload: { targetWeightKg: null, effectiveFrom: '2026-09-10' },
    });

    expect(response.json().targetWeightKg).toBeNull();
  });

  it('keeps the weight target when the field is omitted', async () => {
    const user = await registerUser(app);
    await createGoal(app, user, { targetWeightKg: 72, effectiveFrom: '2026-09-01' });

    const response = await app.inject({
      method: 'POST',
      url: GOALS,
      headers: user.headers,
      payload: { proteinG: 180, effectiveFrom: '2026-09-10' },
    });

    expect(response.json().targetWeightKg).toBe(72);
  });

  it('rejects an out-of-range target', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: GOALS,
      headers: user.headers,
      payload: { ...A_GOAL, dailyCalories: 999_999 },
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('resolving the goal for a date', () => {
  it('returns the version that was active then, not the newest', async () => {
    const user = await registerUser(app);
    await createGoal(app, user, { dailyCalories: 2200, effectiveFrom: '2026-08-01' });
    await createGoal(app, user, { dailyCalories: 2000, effectiveFrom: '2026-09-01' });

    const august = await app.inject({
      method: 'GET',
      url: `${CURRENT}?on=2026-08-15`,
      headers: user.headers,
    });
    const september = await app.inject({
      method: 'GET',
      url: `${CURRENT}?on=2026-09-15`,
      headers: user.headers,
    });

    expect(august.json().dailyCalories).toBe(2200);
    expect(september.json().dailyCalories).toBe(2000);
  });

  it('returns the version starting exactly on the date', async () => {
    const user = await registerUser(app);
    await createGoal(app, user, { effectiveFrom: '2026-09-01' });

    const response = await app.inject({
      method: 'GET',
      url: `${CURRENT}?on=2026-09-01`,
      headers: user.headers,
    });

    expect(response.statusCode).toBe(200);
  });

  it('404s for a date before any goal existed', async () => {
    const user = await registerUser(app);
    await createGoal(app, user, { effectiveFrom: '2026-09-01' });

    const response = await app.inject({
      method: 'GET',
      url: `${CURRENT}?on=2026-07-01`,
      headers: user.headers,
    });

    expect(response.statusCode).toBe(404);
  });

  it('rejects a malformed date', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'GET',
      url: `${CURRENT}?on=15-08-2026`,
      headers: user.headers,
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('goal history', () => {
  it('pages newest first', async () => {
    const user = await registerUser(app);
    await createGoal(app, user, { effectiveFrom: '2026-07-01' });
    await createGoal(app, user, { effectiveFrom: '2026-08-01' });
    await createGoal(app, user, { effectiveFrom: '2026-09-01' });

    const response = await app.inject({
      method: 'GET',
      url: `${GOALS}?pageSize=2`,
      headers: user.headers,
    });

    const body = response.json();
    expect(body.meta).toMatchObject({ total: 3, totalPages: 2, hasNext: true });
    expect(body.data.map((goal: { effectiveFrom: string }) => goal.effectiveFrom)).toEqual([
      '2026-09-01',
      '2026-08-01',
    ]);
  });

  it('does not show another user their goals', async () => {
    const user = await registerUser(app);
    await createGoal(app, user, { effectiveFrom: '2026-09-01' });

    const other = await registerUser(app, { email: 'other@example.com' });
    const response = await app.inject({ method: 'GET', url: GOALS, headers: other.headers });

    expect(response.json().meta.total).toBe(0);
  });
});
