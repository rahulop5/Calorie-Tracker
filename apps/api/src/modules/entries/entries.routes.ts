import {
  bulkEntryInputSchema,
  bulkEntryResultSchema,
  entryInputSchema,
  entryListQuerySchema,
  entrySchema,
  entryUpdateSchema,
  errorResponseSchema,
  idParamSchema,
  listResponseSchema,
  noContentSchema,
} from '@tracker/shared';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { authGuard, getUserId } from '../auth';
import { entriesService } from './entries.service';

export const entriesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', authGuard);

  app.post(
    '/',
    {
      schema: {
        tags: ['Entries'],
        summary: 'Log a food entry',
        body: entryInputSchema,
        response: { 201: entrySchema, 400: errorResponseSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const entry = await entriesService.create(getUserId(request), request.body, 'MANUAL');

      return reply.status(201).send(entry);
    },
  );

  // The single write path for bulk data, used by the PDF review screen and by
  // the photo scanner when a plate produces several foods.
  app.post(
    '/bulk',
    {
      schema: {
        tags: ['Entries'],
        summary: 'Log many entries at once, all or nothing',
        body: bulkEntryInputSchema,
        response: {
          201: bulkEntryResultSchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await entriesService.createBulk(
        getUserId(request),
        request.body.entries,
        request.body.source,
      );

      return reply.status(201).send(result);
    },
  );

  app.get(
    '/',
    {
      schema: {
        tags: ['Entries'],
        summary: 'List entries in a date range, filterable by meal type',
        querystring: entryListQuerySchema,
        response: { 200: listResponseSchema(entrySchema), 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const page = await entriesService.list(getUserId(request), request.query);

      return reply.send(page);
    },
  );

  app.get(
    '/:id',
    {
      schema: {
        tags: ['Entries'],
        summary: 'One food entry',
        params: idParamSchema,
        response: { 200: entrySchema, 401: errorResponseSchema, 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const entry = await entriesService.get(getUserId(request), request.params.id);

      return reply.send(entry);
    },
  );

  app.patch(
    '/:id',
    {
      schema: {
        tags: ['Entries'],
        summary: 'Edit a food entry',
        params: idParamSchema,
        body: entryUpdateSchema,
        response: {
          200: entrySchema,
          400: errorResponseSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const entry = await entriesService.update(
        getUserId(request),
        request.params.id,
        request.body,
      );

      return reply.send(entry);
    },
  );

  app.delete(
    '/:id',
    {
      schema: {
        tags: ['Entries'],
        summary: 'Delete a food entry',
        params: idParamSchema,
        response: {
          204: noContentSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await entriesService.remove(getUserId(request), request.params.id);

      return reply.status(204).send(null);
    },
  );
};
