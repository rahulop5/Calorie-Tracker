import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, credentials, readRefreshCookie, registerUser } from './helpers/app';

const REGISTER = '/api/v1/auth/register';
const LOGIN = '/api/v1/auth/login';
const REFRESH = '/api/v1/auth/refresh';
const LOGOUT = '/api/v1/auth/logout';
const ME = '/api/v1/auth/me';

let app: FastifyInstance;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

describe('register', () => {
  it('creates an account and starts a session', async () => {
    const response = await app.inject({ method: 'POST', url: REGISTER, payload: credentials });

    expect(response.statusCode).toBe(201);

    const body = response.json();
    expect(body.user.email).toBe(credentials.email);
    expect(body.user.name).toBe(credentials.name);
    expect(body.accessToken).toBeTypeOf('string');
    expect(readRefreshCookie(response.cookies)).not.toBe('');
  });

  it('never returns the password hash', async () => {
    const response = await app.inject({ method: 'POST', url: REGISTER, payload: credentials });

    expect(Object.keys(response.json().user).sort()).toEqual(['email', 'id', 'name']);
  });

  it('marks the refresh cookie httpOnly and scopes it to the auth routes', async () => {
    const response = await app.inject({ method: 'POST', url: REGISTER, payload: credentials });
    const cookie = response.cookies.find((item) => item.name === 'refresh_token');

    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.path).toBe('/api/v1/auth');
  });

  it('rejects a duplicate email', async () => {
    await registerUser(app);

    const response = await app.inject({ method: 'POST', url: REGISTER, payload: credentials });

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('CONFLICT');
  });

  it('treats emails as case insensitive', async () => {
    await registerUser(app, { email: 'Demo@Example.com' });

    const response = await app.inject({
      method: 'POST',
      url: REGISTER,
      payload: { ...credentials, email: 'demo@example.COM' },
    });

    expect(response.statusCode).toBe(409);
  });

  it('reports which field failed validation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: REGISTER,
      payload: { ...credentials, password: 'short' },
    });

    expect(response.statusCode).toBe(400);

    const body = response.json();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details.some((detail: { path: string }) => detail.path === 'password')).toBe(
      true,
    );
    expect(body.error.requestId).toBeTypeOf('string');
  });
});

describe('login', () => {
  it('returns a session for the right password', async () => {
    await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: LOGIN,
      payload: { email: credentials.email, password: credentials.password },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toBeTypeOf('string');
  });

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await registerUser(app);

    const wrongPassword = await app.inject({
      method: 'POST',
      url: LOGIN,
      payload: { email: credentials.email, password: 'not-the-password' },
    });
    const unknownEmail = await app.inject({
      method: 'POST',
      url: LOGIN,
      payload: { email: 'nobody@example.com', password: credentials.password },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(wrongPassword.json().error.message).toBe(unknownEmail.json().error.message);
  });
});

describe('me', () => {
  it('returns the signed-in user', async () => {
    const { accessToken, userId } = await registerUser(app);

    const response = await app.inject({
      method: 'GET',
      url: ME,
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().id).toBe(userId);
  });

  it('rejects a missing token', async () => {
    const response = await app.inject({ method: 'GET', url: ME });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHORIZED');
  });

  it('rejects a malformed token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: ME,
      headers: { authorization: 'Bearer not-a-real-jwt' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('rejects a token signed with the wrong secret', async () => {
    // Same payload shape, different secret: it must not be trusted.
    const forged =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.' +
      'eyJzdWIiOiIwMDAwMDAwMC0wMDAwLTAwMDAtMDAwMC0wMDAwMDAwMDAwMDAifQ.' +
      'wrong-signature';

    const response = await app.inject({
      method: 'GET',
      url: ME,
      headers: { authorization: `Bearer ${forged}` },
    });

    expect(response.statusCode).toBe(401);
  });
});

describe('refresh', () => {
  it('issues a new access token and a new cookie', async () => {
    const { refreshCookie } = await registerUser(app);

    const response = await app.inject({
      method: 'POST',
      url: REFRESH,
      cookies: { refresh_token: refreshCookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().accessToken).toBeTypeOf('string');
    expect(readRefreshCookie(response.cookies)).not.toBe(refreshCookie);
  });

  it('rejects a request with no cookie', async () => {
    const response = await app.inject({ method: 'POST', url: REFRESH });

    expect(response.statusCode).toBe(401);
  });

  it('ends every session when a rotated token is replayed', async () => {
    const { refreshCookie: first } = await registerUser(app);

    const rotated = await app.inject({
      method: 'POST',
      url: REFRESH,
      cookies: { refresh_token: first },
    });
    const second = readRefreshCookie(rotated.cookies);

    // Replaying the old token looks like a stolen cookie.
    const replay = await app.inject({
      method: 'POST',
      url: REFRESH,
      cookies: { refresh_token: first },
    });
    expect(replay.statusCode).toBe(401);

    // The legitimate token is revoked too, forcing a fresh login.
    const afterReplay = await app.inject({
      method: 'POST',
      url: REFRESH,
      cookies: { refresh_token: second },
    });
    expect(afterReplay.statusCode).toBe(401);
  });
});

describe('logout', () => {
  it('revokes the refresh token', async () => {
    const { refreshCookie } = await registerUser(app);

    const logout = await app.inject({
      method: 'POST',
      url: LOGOUT,
      cookies: { refresh_token: refreshCookie },
    });
    expect(logout.statusCode).toBe(204);

    const afterLogout = await app.inject({
      method: 'POST',
      url: REFRESH,
      cookies: { refresh_token: refreshCookie },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('succeeds without a cookie', async () => {
    const response = await app.inject({ method: 'POST', url: LOGOUT });

    expect(response.statusCode).toBe(204);
  });
});
