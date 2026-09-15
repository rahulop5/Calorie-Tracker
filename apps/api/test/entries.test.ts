import { todayDateOnly } from '@tracker/shared';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { anEntry, createEntry, createTestApp, registerOtherUser, registerUser } from './helpers/app';

const ENTRIES = '/api/v1/entries';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('creating entries', () => {
  it('requires authentication', async () => {
    const response = await app.inject({ method: 'POST', url: ENTRIES, payload: anEntry() });

    expect(response.statusCode).toBe(401);
  });

  it('stores an entry and marks where it came from', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: user.headers,
      payload: anEntry(),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      entryDate: '2026-09-10',
      foodName: 'Oats with milk',
      calories: 300,
      micros: { fiber_g: 6 },
      source: 'MANUAL',
    });
  });

  it('accepts a date in the past, which is what backfilling needs', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: user.headers,
      payload: anEntry({ entryDate: '2025-01-15' }),
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().entryDate).toBe('2025-01-15');
  });

  it('ignores a source sent by the client', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: user.headers,
      payload: { ...anEntry(), source: 'CHAT' },
    });

    expect(response.json().source).toBe('MANUAL');
  });

  it('rejects a micronutrient key we do not know', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: user.headers,
      payload: { ...anEntry(), micros: { vitaminC: 20 } },
    });

    expect(response.statusCode).toBe(400);
  });

  it('rejects a timestamp where a date belongs', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: user.headers,
      payload: anEntry({ entryDate: '2026-09-10T08:00:00Z' }),
    });

    expect(response.statusCode).toBe(400);
  });

  it('requires macros, which is what routes a blank form to the estimator', async () => {
    const user = await registerUser(app);
    const { proteinG, ...withoutProtein } = anEntry();

    const response = await app.inject({
      method: 'POST',
      url: ENTRIES,
      headers: user.headers,
      payload: withoutProtein,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.details[0].path).toBe('proteinG');
  });
});

describe('bulk creating entries', () => {
  it('writes every row', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: `${ENTRIES}/bulk`,
      headers: user.headers,
      payload: {
        entries: [
          anEntry({ entryDate: '2026-09-01' }),
          anEntry({ entryDate: '2026-09-02' }),
          anEntry({ entryDate: '2026-09-03' }),
        ],
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ created: 3 });
  });

  it('marks bulk rows as coming from a photo when the batch says so', async () => {
    const user = await registerUser(app);
    await app.inject({
      method: 'POST',
      url: `${ENTRIES}/bulk`,
      headers: user.headers,
      payload: { entries: [anEntry()], source: 'IMAGE' },
    });

    const list = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?from=2026-09-01&to=2026-09-30`,
      headers: user.headers,
    });

    expect(list.json().data[0].source).toBe('IMAGE');
  });

  it('refuses a source the client is not allowed to claim', async () => {
    const user = await registerUser(app);

    // Only the two AI review screens produce a batch. A client cannot pass off
    // imported rows as hand-typed ones.
    for (const source of ['MANUAL', 'CHAT', 'AI_ESTIMATE']) {
      const response = await app.inject({
        method: 'POST',
        url: `${ENTRIES}/bulk`,
        headers: user.headers,
        payload: { entries: [anEntry()], source },
      });

      expect(response.statusCode).toBe(400);
    }
  });

  it('defaults bulk rows to a PDF import when no source is given', async () => {
    const user = await registerUser(app);
    await app.inject({
      method: 'POST',
      url: `${ENTRIES}/bulk`,
      headers: user.headers,
      payload: { entries: [anEntry()] },
    });

    const list = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?from=2026-09-01&to=2026-09-30`,
      headers: user.headers,
    });

    expect(list.json().data[0].source).toBe('PDF');
  });

  it('rejects the whole batch and names the bad row', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: `${ENTRIES}/bulk`,
      headers: user.headers,
      payload: {
        entries: [anEntry(), anEntry({ calories: -5 }), anEntry()],
      },
    });

    expect(response.statusCode).toBe(400);
    // The index lets the review table highlight the offending row.
    expect(response.json().error.details[0].path).toBe('entries.1.calories');

    const list = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?from=2026-09-01&to=2026-09-30`,
      headers: user.headers,
    });
    expect(list.json().meta.total).toBe(0);
  });
});

describe('listing entries', () => {
  it('defaults to the last week', async () => {
    const user = await registerUser(app);
    const today = todayDateOnly();
    await createEntry(app, user, { entryDate: today });
    await createEntry(app, user, { entryDate: '2020-01-01' });

    const response = await app.inject({ method: 'GET', url: ENTRIES, headers: user.headers });

    expect(response.json().meta.total).toBe(1);
    expect(response.json().data[0].entryDate).toBe(today);
  });

  it('filters by an explicit range', async () => {
    const user = await registerUser(app);
    await createEntry(app, user, { entryDate: '2026-08-31' });
    await createEntry(app, user, { entryDate: '2026-09-01' });
    await createEntry(app, user, { entryDate: '2026-09-30' });
    await createEntry(app, user, { entryDate: '2026-10-01' });

    const response = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?from=2026-09-01&to=2026-09-30`,
      headers: user.headers,
    });

    // Both ends are inclusive.
    expect(response.json().meta.total).toBe(2);
  });

  it('filters by meal type', async () => {
    const user = await registerUser(app);
    await createEntry(app, user, { mealType: 'BREAKFAST' });
    await createEntry(app, user, { mealType: 'LUNCH' });
    await createEntry(app, user, { mealType: 'LUNCH' });

    const response = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?from=2026-09-01&to=2026-09-30&mealType=LUNCH`,
      headers: user.headers,
    });

    expect(response.json().meta.total).toBe(2);
  });

  it('searches the food name, ignoring case', async () => {
    const user = await registerUser(app);
    await createEntry(app, user, { foodName: 'Grilled Chicken' });
    await createEntry(app, user, { foodName: 'Oats' });

    const response = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?from=2026-09-01&to=2026-09-30&search=chicken`,
      headers: user.headers,
    });

    expect(response.json().meta.total).toBe(1);
  });

  it('sorts by calories', async () => {
    const user = await registerUser(app);
    await createEntry(app, user, { calories: 100 });
    await createEntry(app, user, { calories: 500 });
    await createEntry(app, user, { calories: 300 });

    const response = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?from=2026-09-01&to=2026-09-30&sort=calories:desc`,
      headers: user.headers,
    });

    expect(response.json().data.map((entry: { calories: number }) => entry.calories)).toEqual([
      500, 300, 100,
    ]);
  });

  it('pages without repeating or losing rows when values tie', async () => {
    const user = await registerUser(app);

    // Same date and meal, so only the id tiebreaker keeps paging stable.
    for (let i = 0; i < 5; i += 1) {
      await createEntry(app, user, { foodName: `Item ${i}` });
    }

    const range = `from=2026-09-01&to=2026-09-30`;
    const first = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?${range}&pageSize=2&page=1`,
      headers: user.headers,
    });
    const second = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?${range}&pageSize=2&page=2`,
      headers: user.headers,
    });
    const third = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?${range}&pageSize=2&page=3`,
      headers: user.headers,
    });

    const ids = [...first.json().data, ...second.json().data, ...third.json().data].map(
      (entry: { id: string }) => entry.id,
    );

    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(first.json().meta).toMatchObject({ total: 5, totalPages: 3, hasNext: true });
    expect(third.json().meta.hasNext).toBe(false);
  });

  it('returns an empty page past the end', async () => {
    const user = await registerUser(app);
    await createEntry(app, user);

    const response = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?from=2026-09-01&to=2026-09-30&page=50`,
      headers: user.headers,
    });

    expect(response.json().data).toEqual([]);
    expect(response.json().meta.total).toBe(1);
  });

  it('rejects a page size over the maximum', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?pageSize=500`,
      headers: user.headers,
    });

    expect(response.statusCode).toBe(400);
  });

  it('never shows another user’s entries', async () => {
    const user = await registerUser(app);
    await createEntry(app, user);

    const other = await registerOtherUser(app);
    const response = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?from=2026-09-01&to=2026-09-30`,
      headers: other.headers,
    });

    expect(response.json().meta.total).toBe(0);
  });
});

describe('updating entries', () => {
  it('changes only the fields sent', async () => {
    const user = await registerUser(app);
    const entry = await createEntry(app, user);

    const response = await app.inject({
      method: 'PATCH',
      url: `${ENTRIES}/${entry.id}`,
      headers: user.headers,
      payload: { foodName: 'Oats with almond milk' },
    });

    expect(response.json()).toMatchObject({
      foodName: 'Oats with almond milk',
      calories: 300,
      quantity: 200,
    });
  });

  it('leaves nutrition alone when the quantity changes', async () => {
    const user = await registerUser(app);
    const entry = await createEntry(app, user);

    const response = await app.inject({
      method: 'PATCH',
      url: `${ENTRIES}/${entry.id}`,
      headers: user.headers,
      payload: { quantity: 300 },
    });

    // Quantity is descriptive; the stored totals are whatever the user gave us.
    expect(response.json()).toMatchObject({
      quantity: 300,
      calories: 300,
      proteinG: 12,
      micros: { fiber_g: 6 },
    });
  });

  it('moves an entry to another day', async () => {
    const user = await registerUser(app);
    const entry = await createEntry(app, user);

    const response = await app.inject({
      method: 'PATCH',
      url: `${ENTRIES}/${entry.id}`,
      headers: user.headers,
      payload: { entryDate: '2026-09-11' },
    });

    expect(response.json().entryDate).toBe('2026-09-11');
  });

  it('rejects an empty patch', async () => {
    const user = await registerUser(app);
    const entry = await createEntry(app, user);

    const response = await app.inject({
      method: 'PATCH',
      url: `${ENTRIES}/${entry.id}`,
      headers: user.headers,
      payload: {},
    });

    expect(response.statusCode).toBe(400);
  });

  it('will not patch another user’s entry', async () => {
    const user = await registerUser(app);
    const entry = await createEntry(app, user);
    const other = await registerOtherUser(app);

    const response = await app.inject({
      method: 'PATCH',
      url: `${ENTRIES}/${entry.id}`,
      headers: other.headers,
      payload: { foodName: 'Hacked' },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('deleting entries', () => {
  it('hides the entry from reads', async () => {
    const user = await registerUser(app);
    const entry = await createEntry(app, user);

    const deleted = await app.inject({
      method: 'DELETE',
      url: `${ENTRIES}/${entry.id}`,
      headers: user.headers,
    });
    expect(deleted.statusCode).toBe(204);

    const fetched = await app.inject({
      method: 'GET',
      url: `${ENTRIES}/${entry.id}`,
      headers: user.headers,
    });
    expect(fetched.statusCode).toBe(404);

    const list = await app.inject({
      method: 'GET',
      url: `${ENTRIES}?from=2026-09-01&to=2026-09-30`,
      headers: user.headers,
    });
    expect(list.json().meta.total).toBe(0);
  });

  it('404s on a second delete', async () => {
    const user = await registerUser(app);
    const entry = await createEntry(app, user);
    const url = `${ENTRIES}/${entry.id}`;

    await app.inject({ method: 'DELETE', url, headers: user.headers });
    const again = await app.inject({ method: 'DELETE', url, headers: user.headers });

    expect(again.statusCode).toBe(404);
  });

  it('rejects an id that is not a uuid', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'DELETE',
      url: `${ENTRIES}/not-a-uuid`,
      headers: user.headers,
    });

    expect(response.statusCode).toBe(400);
  });
});
