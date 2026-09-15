import type { FastifyRequest } from 'fastify';
import { AppError } from '../../common/errors';
import { verifyAccessToken } from './tokens';

const BEARER_PREFIX = 'Bearer ';

/** preHandler for any route that needs a logged-in user. */
export async function authGuard(request: FastifyRequest): Promise<void> {
  const header = request.headers.authorization;

  if (!header || !header.startsWith(BEARER_PREFIX)) {
    throw AppError.unauthorized('Missing bearer token');
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  const payload = verifyAccessToken(token);

  request.user = { id: payload.sub };
}

/**
 * The authenticated user id. Every DAO call scopes by this, so it is the only
 * place a request's identity comes from — never from the request body.
 */
export function getUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw AppError.unauthorized();
  }

  return request.user.id;
}
