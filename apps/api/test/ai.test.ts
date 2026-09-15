import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser } from './helpers/app';

const EXTRACT = '/api/v1/ai/extract-nutrition';
const ESTIMATE = '/api/v1/ai/estimate-nutrition';
const IMPORT = '/api/v1/ai/import-pdf';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

/** Minimal multipart body, so uploads are exercised without a fixture file. */
function multipart(
  field: string,
  filename: string,
  contentType: string,
  body: Buffer,
): { payload: Buffer; headers: Record<string, string> } {
  const boundary = '----tracker-test-boundary';
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);

  return {
    payload: Buffer.concat([head, body, tail]),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

describe('photo extraction', () => {
  it('requires authentication', async () => {
    const response = await app.inject({ method: 'POST', url: EXTRACT });

    expect(response.statusCode).toBe(401);
  });

  it('returns drafts and stores nothing', async () => {
    const user = await registerUser(app);
    // Even length, so the stub answers as a nutrition label.
    const upload = multipart('image', 'label.png', 'image/png', Buffer.alloc(64, 7));

    const response = await app.inject({
      method: 'POST',
      url: EXTRACT,
      headers: { ...user.headers, ...upload.headers },
      payload: upload.payload,
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.kind).toBe('LABEL');
    expect(body.drafts.length).toBeGreaterThan(0);
    expect(body.confidence).toBeGreaterThan(0);

    // Proposal-only: the draft must not have become an entry.
    const entries = await app.inject({
      method: 'GET',
      url: '/api/v1/entries',
      headers: user.headers,
    });
    expect(entries.json().meta.total).toBe(0);
  });

  it('returns one draft per food for a plate', async () => {
    const user = await registerUser(app);
    const upload = multipart('image', 'plate.jpg', 'image/jpeg', Buffer.alloc(65, 3));

    const response = await app.inject({
      method: 'POST',
      url: EXTRACT,
      headers: { ...user.headers, ...upload.headers },
      payload: upload.payload,
    });

    expect(response.json().kind).toBe('PLATE');
    expect(response.json().drafts.length).toBeGreaterThan(1);
  });

  it('rejects a file that is not an image', async () => {
    const user = await registerUser(app);
    const upload = multipart('image', 'notes.txt', 'text/plain', Buffer.from('hello'));

    const response = await app.inject({
      method: 'POST',
      url: EXTRACT,
      headers: { ...user.headers, ...upload.headers },
      payload: upload.payload,
    });

    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects a request with no file', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: EXTRACT,
      headers: { ...user.headers, 'content-type': 'application/json' },
      payload: {},
    });

    expect(response.statusCode).toBe(415);
  });
});

describe('nutrition estimation', () => {
  it('keeps the food the user named', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: ESTIMATE,
      headers: user.headers,
      payload: { foodName: '2 scrambled eggs', quantity: 2, unit: 'PIECE' },
    });

    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.draft.foodName).toBe('2 scrambled eggs');
    expect(body.draft.quantity).toBe(2);
    expect(body.draft.unit).toBe('PIECE');
    expect(body.draft.calories).toBeGreaterThan(0);
  });

  it('rejects an empty food name', async () => {
    const user = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: ESTIMATE,
      headers: user.headers,
      payload: { foodName: '   ', quantity: 2, unit: 'PIECE' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('produces a draft the entries endpoint accepts', async () => {
    const user = await registerUser(app);

    const estimate = await app.inject({
      method: 'POST',
      url: ESTIMATE,
      headers: user.headers,
      payload: { foodName: 'Oat porridge', quantity: 250, unit: 'G' },
    });

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/entries',
      headers: user.headers,
      payload: {
        ...estimate.json().draft,
        entryDate: '2026-09-13',
        mealType: 'BREAKFAST',
      },
    });

    expect(created.statusCode).toBe(201);
  });
});

describe('pdf import', () => {
  it('returns candidates and flags the unusable row', async () => {
    const user = await registerUser(app);
    const upload = multipart('file', 'diary.pdf', 'application/pdf', Buffer.alloc(128, 1));

    const response = await app.inject({
      method: 'POST',
      url: IMPORT,
      headers: { ...user.headers, ...upload.headers },
      payload: upload.payload,
    });

    expect(response.statusCode).toBe(200);

    const candidates = response.json().candidates;
    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.some((row: { valid: boolean }) => row.valid)).toBe(true);

    // The stub returns one row with no date, which must be flagged not dropped.
    const flagged = candidates.find((row: { valid: boolean }) => !row.valid);
    expect(flagged.issues.length).toBeGreaterThan(0);

    // Nothing is written until the browser posts the reviewed rows.
    const entries = await app.inject({
      method: 'GET',
      url: '/api/v1/entries',
      headers: user.headers,
    });
    expect(entries.json().meta.total).toBe(0);
  });

  it('rejects a file that is not a PDF', async () => {
    const user = await registerUser(app);
    const upload = multipart('file', 'diary.png', 'image/png', Buffer.alloc(16, 1));

    const response = await app.inject({
      method: 'POST',
      url: IMPORT,
      headers: { ...user.headers, ...upload.headers },
      payload: upload.payload,
    });

    expect(response.statusCode).toBe(415);
  });

  it('candidates round-trip through the bulk endpoint', async () => {
    const user = await registerUser(app);
    const upload = multipart('file', 'diary.pdf', 'application/pdf', Buffer.alloc(128, 1));

    const parsed = await app.inject({
      method: 'POST',
      url: IMPORT,
      headers: { ...user.headers, ...upload.headers },
      payload: upload.payload,
    });

    const valid = parsed
      .json()
      .candidates.filter((row: { valid: boolean }) => row.valid)
      .map((row: { draft: unknown }) => row.draft);

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/entries/bulk',
      headers: user.headers,
      payload: { entries: valid },
    });

    expect(created.statusCode).toBe(201);
    expect(created.json().created).toBe(valid.length);
  });
});
