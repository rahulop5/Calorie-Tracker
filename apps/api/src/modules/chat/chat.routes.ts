import {
  chatMessageRecordSchema,
  conversationSchema,
  createConversationInputSchema,
  errorResponseSchema,
  idParamSchema,
  listResponseSchema,
  noContentSchema,
  paginationQuerySchema,
  sendMessageInputSchema,
} from '@tracker/shared';
import type { FastifyReply } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { AppError } from '../../common/errors';
import { env } from '../../config/env';
import { authGuard, getUserId } from '../auth';
import type { ChatEvent } from '../ai/provider';
import { chatService } from './chat.service';

const chatRateLimit = {
  rateLimit: { max: env.AI_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' },
};

/** One SSE frame. Named events keep the client's handler a simple switch. */
function sendEvent(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Trims a tool result down to something a user can read at a glance. */
function summarise(output: unknown): string {
  if (output === null || output === undefined) {
    return 'No result';
  }

  if (typeof output === 'object' && 'error' in output) {
    return String((output as { error: unknown }).error);
  }

  const text = JSON.stringify(output);

  return text.length > 160 ? `${text.slice(0, 159)}…` : text;
}

export const chatRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', authGuard);

  app.post(
    '/conversations',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Start a conversation',
        body: createConversationInputSchema,
        response: { 201: conversationSchema, 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const conversation = await chatService.create(getUserId(request), request.body.title);

      return reply.status(201).send(conversation);
    },
  );

  app.get(
    '/conversations',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Conversations, most recently used first',
        querystring: paginationQuerySchema,
        response: { 200: listResponseSchema(conversationSchema), 401: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const page = await chatService.list(getUserId(request), request.query);

      return reply.send(page);
    },
  );

  app.get(
    '/conversations/:id/messages',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Messages in a conversation, oldest first',
        params: idParamSchema,
        querystring: paginationQuerySchema,
        response: {
          200: listResponseSchema(chatMessageRecordSchema),
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const page = await chatService.listMessages(
        getUserId(request),
        request.params.id,
        request.query,
      );

      return reply.send(page);
    },
  );

  app.delete(
    '/conversations/:id',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Delete a conversation',
        params: idParamSchema,
        response: {
          204: noContentSchema,
          401: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await chatService.remove(getUserId(request), request.params.id);

      return reply.status(204).send(null);
    },
  );

  // Server-Sent Events, so tokens and tool activity reach the user as they
  // happen. No response schema: the body is a stream, not JSON.
  app.post(
    '/conversations/:id/messages',
    {
      config: chatRateLimit,
      schema: {
        tags: ['Chat'],
        summary: 'Send a message and stream the reply as Server-Sent Events',
        params: idParamSchema,
        body: sendMessageInputSchema,
      },
    },
    async (request, reply) => {
      const userId = getUserId(request);

      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache, no-transform',
        connection: 'keep-alive',
      });

      function forward(event: ChatEvent): void {
        switch (event.type) {
          case 'text':
            sendEvent(reply, 'token', { text: event.text });
            break;
          case 'tool_call':
            sendEvent(reply, 'tool_start', { name: event.call.name, input: event.call.input });
            break;
          case 'tool_result':
            sendEvent(reply, 'tool_result', {
              name: event.call.name,
              summary: summarise(event.output),
              isError: event.isError,
            });
            break;
          default:
            break;
        }
      }

      try {
        const result = await chatService.send(userId, request.params.id, request.body.content, forward);
        sendEvent(reply, 'done', result);
      } catch (error) {
        // The headers are already sent, so a failure has to travel as an event
        // rather than as an HTTP status.
        const appError = error instanceof AppError ? error : null;

        if (!appError || appError.status >= 500) {
          request.log.error({ err: error }, 'chat stream failed');
        }

        sendEvent(reply, 'error', {
          code: appError?.code ?? 'INTERNAL_ERROR',
          message: appError?.message ?? 'Something went wrong',
        });
      } finally {
        reply.raw.end();
      }
    },
  );
};
