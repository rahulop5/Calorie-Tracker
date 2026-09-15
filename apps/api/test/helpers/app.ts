import type { EntryInput } from '@tracker/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp, type BuildAppOptions } from '../../src/app';

export async function createTestApp(options?: BuildAppOptions): Promise<FastifyInstance> {
  const app = await buildApp(options);
  await app.ready();

  return app;
}

export const credentials = {
  email: 'demo@example.com',
  password: 'correct-horse-battery',
  name: 'Demo User',
};

type RegisteredUser = {
  accessToken: string;
  refreshCookie: string;
  userId: string;
  headers: { authorization: string };
};

/** Registers a user and returns what later requests need. */
export async function registerUser(
  app: FastifyInstance,
  overrides: Partial<typeof credentials> = {},
): Promise<RegisteredUser> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { ...credentials, ...overrides },
  });

  const body = response.json();

  return {
    accessToken: body.accessToken,
    refreshCookie: readRefreshCookie(response.cookies),
    userId: body.user.id,
    headers: { authorization: `Bearer ${body.accessToken}` },
  };
}

/** A second account, for checking that one user cannot see another's data. */
export function registerOtherUser(app: FastifyInstance): Promise<RegisteredUser> {
  return registerUser(app, { email: 'other@example.com', name: 'Other User' });
}

type InjectedCookie = { name: string; value: string };

export function readRefreshCookie(cookies: InjectedCookie[]): string {
  const cookie = cookies.find((item) => item.name === 'refresh_token');

  return cookie ? cookie.value : '';
}

export function anEntry(overrides: Partial<EntryInput> = {}): EntryInput {
  return {
    entryDate: '2026-09-10',
    mealType: 'BREAKFAST',
    foodName: 'Oats with milk',
    quantity: 200,
    unit: 'G',
    calories: 300,
    proteinG: 12,
    carbsG: 48,
    fatG: 7,
    micros: { fiber_g: 6 },
    ...overrides,
  };
}

export async function createEntry(
  app: FastifyInstance,
  user: RegisteredUser,
  overrides: Partial<EntryInput> = {},
) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/entries',
    headers: user.headers,
    payload: anEntry(overrides),
  });

  return response.json();
}

export const A_GOAL = {
  dailyCalories: 2000,
  proteinG: 150,
  carbsG: 200,
  fatG: 60,
};

export async function createGoal(
  app: FastifyInstance,
  user: RegisteredUser,
  overrides: Record<string, unknown> = {},
) {
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/goals',
    headers: user.headers,
    payload: { ...A_GOAL, ...overrides },
  });

  return response.json();
}
