import {
  accessTokenResponseSchema,
  authResponseSchema,
  errorResponseSchema,
  loginInputSchema,
  publicUserSchema,
  registerInputSchema,
} from '@tracker/shared';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { isProduction } from '../../config/env';
import { authGuard, getUserId } from './auth.guard';
import { authService, type AuthSession } from './auth.service';

const REFRESH_COOKIE = 'refresh_token';

// Scoped to the auth routes so the cookie is not attached to every other request.
const REFRESH_COOKIE_PATH = '/api/v1/auth';

// Login and register are the brute-force targets, so they get a tighter limit
// than the global one.
const authRateLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

function setRefreshCookie(reply: FastifyReply, session: AuthSession): void {
  reply.setCookie(REFRESH_COOKIE, session.refreshToken, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    secure: isProduction,
    // In production the web app is on another domain, which requires None.
    sameSite: isProduction ? 'none' : 'lax',
    expires: session.refreshTokenExpiresAt,
  });
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, {
    path: REFRESH_COOKIE_PATH,
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
  });
}

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    '/register',
    {
      config: authRateLimit,
      schema: {
        tags: ['Auth'],
        summary: 'Create an account and start a session',
        body: registerInputSchema,
        response: {
          201: authResponseSchema,
          400: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await authService.register(request.body);
      setRefreshCookie(reply, session);

      return reply.status(201).send({
        user: session.user,
        accessToken: session.accessToken,
      });
    },
  );

  app.post(
    '/login',
    {
      config: authRateLimit,
      schema: {
        tags: ['Auth'],
        summary: 'Start a session',
        body: loginInputSchema,
        response: {
          200: authResponseSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await authService.login(request.body);
      setRefreshCookie(reply, session);

      return reply.send({
        user: session.user,
        accessToken: session.accessToken,
      });
    },
  );

  app.post(
    '/refresh',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Exchange the refresh cookie for a new access token',
        response: {
          200: accessTokenResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const session = await authService.refresh(request.cookies[REFRESH_COOKIE]);
      setRefreshCookie(reply, session);

      return reply.send({ accessToken: session.accessToken });
    },
  );

  app.post(
    '/logout',
    {
      schema: {
        tags: ['Auth'],
        summary: 'Revoke the current refresh token',
      },
    },
    async (request, reply) => {
      await authService.logout(request.cookies[REFRESH_COOKIE]);
      clearRefreshCookie(reply);

      return reply.status(204).send();
    },
  );

  app.get(
    '/me',
    {
      preHandler: authGuard,
      schema: {
        tags: ['Auth'],
        summary: 'The signed-in user',
        response: {
          200: publicUserSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const user = await authService.getUser(getUserId(request));

      return reply.send(user);
    },
  );
};
