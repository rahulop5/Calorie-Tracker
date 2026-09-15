import {
  currentGoalQuerySchema,
  errorResponseSchema,
  goalSchema,
  goalUpdateSchema,
  listResponseSchema,
  paginationQuerySchema,
} from '@tracker/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authGuard, getUserId } from '../auth';
import { goalsService } from './goals.service';

export const goalsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', authGuard);

  app.get(
    '/current',
    {
      schema: {
        tags: ['Goals'],
        summary: 'The goal in force on a date, today by default',
        querystring: currentGoalQuerySchema,
        response: { 200: goalSchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const goal = await goalsService.getActiveOn(getUserId(request), request.query.on);

      return reply.send(goal);
    },
  );

  app.get(
    '/',
    {
      schema: {
        tags: ['Goals'],
        summary: 'Goal version history, newest first',
        querystring: paginationQuerySchema,
        response: { 200: listResponseSchema(goalSchema), 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const page = await goalsService.list(getUserId(request), request.query);

      return reply.send(page);
    },
  );

  app.post(
    '/',
    {
      schema: {
        tags: ['Goals'],
        summary: 'Create a goal version, merged onto the one currently in force',
        body: goalUpdateSchema,
        response: { 201: goalSchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const goal = await goalsService.setGoal(getUserId(request), request.body);

      return reply.status(201).send(goal);
    },
  );
};
