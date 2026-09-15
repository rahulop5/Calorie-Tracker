// The import makes this file a module, so the block below augments Fastify's
// types instead of replacing them.
import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the auth guard. Read it with getUserId(request). */
    user?: { id: string };
  }
}
