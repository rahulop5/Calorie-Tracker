import {
  bucketedReportQuerySchema,
  caloriePointSchema,
  errorResponseSchema,
  goalVsActualPointSchema,
  listResponseSchema,
  macroPointSchema,
  mealBreakdownReportSchema,
  microsReportSchema,
  reportRangeQuerySchema,
  summaryReportSchema,
  weightPointSchema,
} from '@tracker/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authGuard, getUserId } from '../auth';
import { reportsService } from './reports.service';

const errors = { 400: errorResponseSchema, 401: errorResponseSchema };

export const reportsRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', authGuard);

  app.get(
    '/summary',
    {
      schema: {
        tags: ['Reports'],
        summary: 'Totals, daily averages and the goal in force',
        querystring: reportRangeQuerySchema,
        response: { 200: summaryReportSchema, ...errors },
      },
    },
    async (request, reply) => {
      const report = await reportsService.summary(getUserId(request), request.query);

      return reply.send(report);
    },
  );

  app.get(
    '/calories',
    {
      schema: {
        tags: ['Reports'],
        summary: 'Calorie trend by day or week, against the goal',
        querystring: bucketedReportQuerySchema,
        response: { 200: listResponseSchema(caloriePointSchema), ...errors },
      },
    },
    async (request, reply) => {
      const report = await reportsService.calories(getUserId(request), request.query);

      return reply.send(report);
    },
  );

  app.get(
    '/macros',
    {
      schema: {
        tags: ['Reports'],
        summary: 'Protein, carbs and fat by day or week, in grams and percentages',
        querystring: bucketedReportQuerySchema,
        response: { 200: listResponseSchema(macroPointSchema), ...errors },
      },
    },
    async (request, reply) => {
      const report = await reportsService.macros(getUserId(request), request.query);

      return reply.send(report);
    },
  );

  app.get(
    '/micros',
    {
      schema: {
        tags: ['Reports'],
        summary: 'Micronutrient totals against reference daily values',
        querystring: reportRangeQuerySchema,
        response: { 200: microsReportSchema, ...errors },
      },
    },
    async (request, reply) => {
      const report = await reportsService.micros(getUserId(request), request.query);

      return reply.send(report);
    },
  );

  app.get(
    '/goal-vs-actual',
    {
      schema: {
        tags: ['Reports'],
        summary: 'Goal against actual intake per bucket',
        querystring: bucketedReportQuerySchema,
        response: { 200: listResponseSchema(goalVsActualPointSchema), ...errors },
      },
    },
    async (request, reply) => {
      const report = await reportsService.goalVsActual(getUserId(request), request.query);

      return reply.send(report);
    },
  );

  app.get(
    '/meal-breakdown',
    {
      schema: {
        tags: ['Reports'],
        summary: 'Totals grouped by meal type',
        querystring: reportRangeQuerySchema,
        response: { 200: mealBreakdownReportSchema, ...errors },
      },
    },
    async (request, reply) => {
      const report = await reportsService.mealBreakdown(getUserId(request), request.query);

      return reply.send(report);
    },
  );

  app.get(
    '/weight',
    {
      schema: {
        tags: ['Reports'],
        summary: 'Weight over time against the target active that day',
        querystring: bucketedReportQuerySchema,
        response: { 200: listResponseSchema(weightPointSchema), ...errors },
      },
    },
    async (request, reply) => {
      const report = await reportsService.weight(getUserId(request), request.query);

      return reply.send(report);
    },
  );
};
