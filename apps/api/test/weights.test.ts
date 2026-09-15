import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerOtherUser, registerUser } from './helpers/app';

const WEIGHTS = '/api/v1/weights';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

async function logWeight(
  user: { headers: { authorization: string } },
  payload: Record<string, unknown>,
) {
  return app.inject({ method: 'PUT', url: WEIGHTS, headers: user.headers, payload });
}

describe('recording weight', () => {
  it('requires authentication', async () => {
    const response = await app.inject({ method: 'PUT', url: WEIGHTS, payload: { weightKg: 74 } });

    expect(response.statusCode).toBe(401);
  });

  it('stores a weight for a day', async () => {
    const user = await registerUser(app);

    const response = await logWeight(user, { weightKg: 74.5, measuredOn: '2026-09-10' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ measuredOn: '2026-09-10', weightKg: 74.5 });
  });

  it('overwrites rather than duplicating when the same day is logged twice', async () => {
    const user = await registerUser(app);
    await logWeight(user, { weightKg: 74.5, measuredOn: '2026-09-10' });
    await logWeight(user, { weightKg: 74, measuredOn: '2026-09-10' });

    const list = await app.inject({ method: 'GET', url: WEIGHTS, headers: user.headers });

    expect(list.json().meta.total).toBe(1);
    expect(list.json().data[0].weightKg).toBe(74);
  });

  it('rejects an implausible weight', async () => {
    const user = await registerUser(app);

    expect((await logWeight(user, { weightKg: 5 })).statusCode).toBe(400);
    expect((await logWeight(user, { weightKg: 900 })).statusCode).toBe(400);
  });

  it('rejects a malformed date', async () => {
    const user = await registerUser(app);

    const response = await logWeight(user, { weightKg: 74, measuredOn: '10-09-2026' });

    expect(response.statusCode).toBe(400);
  });
});

describe('reading weight', () => {
  it('returns the most recent entry', async () => {
    const user = await registerUser(app);
    await logWeight(user, { weightKg: 76, measuredOn: '2026-09-01' });
    await logWeight(user, { weightKg: 74, measuredOn: '2026-09-10' });

    const response = await app.inject({
      method: 'GET',
      url: `${WEIGHTS}/latest`,
      headers: user.headers,
    });

    expect(response.json()).toMatchObject({ measuredOn: '2026-09-10', weightKg: 74 });
  });

  it('404s when nothing has been logged', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'GET',
      url: `${WEIGHTS}/latest`,
      headers: user.headers,
    });

    expect(response.statusCode).toBe(404);
  });

  it('filters by date range', async () => {
    const user = await registerUser(app);
    await logWeight(user, { weightKg: 76, measuredOn: '2026-08-01' });
    await logWeight(user, { weightKg: 75, measuredOn: '2026-09-05' });
    await logWeight(user, { weightKg: 74, measuredOn: '2026-09-10' });

    const response = await app.inject({
      method: 'GET',
      url: `${WEIGHTS}?from=2026-09-01&to=2026-09-30`,
      headers: user.headers,
    });

    expect(response.json().meta.total).toBe(2);
  });

  it('rejects a backwards range', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'GET',
      url: `${WEIGHTS}?from=2026-09-30&to=2026-09-01`,
      headers: user.headers,
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('deleting weight', () => {
  it('removes the entry', async () => {
    const user = await registerUser(app);
    const created = await logWeight(user, { weightKg: 74, measuredOn: '2026-09-10' });

    const response = await app.inject({
      method: 'DELETE',
      url: `${WEIGHTS}/${created.json().id}`,
      headers: user.headers,
    });

    expect(response.statusCode).toBe(204);

    const latest = await app.inject({
      method: 'GET',
      url: `${WEIGHTS}/latest`,
      headers: user.headers,
    });
    expect(latest.statusCode).toBe(404);
  });

  it('frees the day so it can be logged again', async () => {
    const user = await registerUser(app);
    const created = await logWeight(user, { weightKg: 74, measuredOn: '2026-09-10' });

    await app.inject({
      method: 'DELETE',
      url: `${WEIGHTS}/${created.json().id}`,
      headers: user.headers,
    });

    // This is why weight logs are hard deleted: a hidden row would block the day.
    const again = await logWeight(user, { weightKg: 73, measuredOn: '2026-09-10' });
    expect(again.statusCode).toBe(200);
  });

  it('will not delete another user’s entry', async () => {
    const user = await registerUser(app);
    const created = await logWeight(user, { weightKg: 74, measuredOn: '2026-09-10' });

    const other = await registerOtherUser(app);
    const response = await app.inject({
      method: 'DELETE',
      url: `${WEIGHTS}/${created.json().id}`,
      headers: other.headers,
    });

    expect(response.statusCode).toBe(404);
  });
});
