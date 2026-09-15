import { Prisma } from '@prisma/client';
import type { ErrorCode, ErrorDetail, ErrorResponse } from '@tracker/shared';
import type { FastifyError, FastifyInstance, FastifySchemaValidationError } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { AppError } from './app-error';

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  429: 'RATE_LIMITED',
};

function envelope(
  code: ErrorCode,
  message: string,
  requestId: string,
  details?: ErrorDetail[],
): ErrorResponse {
  return { error: { code, message, details, requestId } };
}

/** '/micros/vitamin_c_mg' becomes 'micros.vitamin_c_mg'. */
function fieldPath(item: FastifySchemaValidationError): string {
  const path = item.instancePath.replace(/^\//, '').replaceAll('/', '.');

  return path || '(root)';
}

/** Turns the Prisma errors we can act on into AppErrors. */
function fromPrismaError(error: unknown): AppError | undefined {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return undefined;
  }

  switch (error.code) {
    case 'P2002':
      return AppError.conflict('That value already exists');
    case 'P2025':
      return AppError.notFound();
    case 'P2003':
      return AppError.validation('A referenced record does not exist');
    default:
      return undefined;
  }
}

/**
 * One place decides what the client sees. Internal messages and stack traces are
 * logged, never sent, and every response carries the request id so a user report
 * can be traced to a log line.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;
    const fastifyError = error as FastifyError;

    if (hasZodFastifySchemaValidationErrors(error)) {
      const details = error.validation.map((item) => ({
        path: fieldPath(item),
        message: item.message ?? 'Invalid value',
      }));

      return reply
        .status(400)
        .send(envelope('VALIDATION_ERROR', 'Request validation failed', requestId, details));
    }

    // Our response did not match its own schema. That is a bug on our side.
    if (isResponseSerializationError(error)) {
      request.log.error({ err: error }, 'response failed its schema');

      return reply
        .status(500)
        .send(envelope('INTERNAL_ERROR', 'Something went wrong', requestId));
    }

    const appError = error instanceof AppError ? error : fromPrismaError(error);

    if (appError) {
      if (appError.status >= 500) {
        request.log.error({ err: error }, appError.message);
      }

      return reply
        .status(appError.status)
        .send(envelope(appError.code, appError.message, requestId, appError.details));
    }

    // Errors raised by Fastify itself or its plugins, such as a rate limit hit.
    const status = fastifyError.statusCode;
    const mapped = status ? CODE_BY_STATUS[status] : undefined;

    if (status && mapped) {
      return reply.status(status).send(envelope(mapped, fastifyError.message, requestId));
    }

    request.log.error({ err: error }, 'unhandled error');

    return reply.status(500).send(envelope('INTERNAL_ERROR', 'Something went wrong', requestId));
  });

  app.setNotFoundHandler((request, reply) => {
    const message = `Route ${request.method} ${request.url} not found`;

    return reply.status(404).send(envelope('NOT_FOUND', message, request.id));
  });
}
