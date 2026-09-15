import { z } from 'zod';
import { pageMetaSchema } from './pagination';

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'AI_PROVIDER_ERROR',
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const errorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof errorDetailSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.array(errorDetailSchema).optional(),
    requestId: z.string().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Wraps any item schema in the shared list envelope. */
export function listResponseSchema<T extends z.ZodType>(item: T) {
  return z.object({
    data: z.array(item),
    meta: pageMetaSchema,
  });
}

/**
 * Body schema for a 204. Fastify strips the payload for that status, so this
 * exists to document the response and to keep the route's status types honest.
 */
export const noContentSchema = z.null();
