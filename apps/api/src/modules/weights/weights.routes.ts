import {
  errorResponseSchema,
  idParamSchema,
  listResponseSchema,
  noContentSchema,
  weightListQuerySchema,
  weightLogInputSchema,
  weightLogSchema,
} from '@tracker/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authGuard, getUserId } from '../auth';
import { weightsService } from './weights.service';

export const weightsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', authGuard);

  app.get(
    '/',
    {
      schema: {
        tags: ['Weight'],
        summary: 'Weight history, newest first',
        querystring: weightListQuerySchema,
        response: { 200: listResponseSchema(weightLogSchema), 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const page = await weightsService.list(getUserId(request), request.query);

      return reply.send(page);
    },
  );

  app.get(
    '/latest',
    {
      schema: {
        tags: ['Weight'],
        summary: 'The most recently logged weight',
        response: { 200: weightLogSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const weight = await weightsService.getLatest(getUserId(request));

      return reply.send(weight);
    },
  );

  // PUT because there is one weight per day, which makes this idempotent.
  app.put(
    '/',
    {
      schema: {
        tags: ['Weight'],
        summary: 'Record a weight for a day, replacing any existing one',
        body: weightLogInputSchema,
        response: { 200: weightLogSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const weight = await weightsService.record(getUserId(request), request.body);

      return reply.send(weight);
    },
  );

  app.delete(
    '/:id',
    {
      schema: {
        tags: ['Weight'],
        summary: 'Delete a logged weight',
        params: idParamSchema,
        response: {
          204: noContentSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await weightsService.remove(getUserId(request), request.params.id);

      return reply.status(204).send(null);
    },
  );
};
