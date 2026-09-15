import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, credentials } from './helpers/app';

// Rate limiting is off for the rest of the suite, so it gets its own app.
let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp({ enableRateLimit: true });
});

afterAll(async () => {
  await app.close();
});

describe('login rate limit', () => {
  it('blocks repeated attempts with the shared error envelope', async () => {
    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: { email: credentials.email, password: 'wrong-password' },
      });

    const statuses: number[] = [];

    for (let i = 0; i < 12; i += 1) {
      const response = await attempt();
      statuses.push(response.statusCode);

      if (response.statusCode === 429) {
        expect(response.json().error.code).toBe('RATE_LIMITED');
        break;
      }
    }

    expect(statuses).toContain(429);
  });
});
