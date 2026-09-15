import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { APP_VERSION } from '../../config/env';
import { pingDb } from '../../db';

const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  version: z.string(),
  db: z.enum(['up', 'down']),
});

export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health',
    {
      // Uptime checks should not be rate limited.
      config: { rateLimit: false },
      schema: {
        tags: ['Health'],
        summary: 'Liveness and database connectivity',
        response: {
          200: healthResponseSchema,
          503: healthResponseSchema,
        },
      },
    },
    async (_request, reply) => {
      const dbUp = await pingDb();

      // 503 so a load balancer takes the instance out of rotation.
      return reply.status(dbUp ? 200 : 503).send({
        status: dbUp ? 'ok' : 'degraded',
        version: APP_VERSION,
        db: dbUp ? 'up' : 'down',
      });
    },
  );
};
