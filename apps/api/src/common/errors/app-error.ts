import type { ErrorCode, ErrorDetail } from '@tracker/shared';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  AI_PROVIDER_ERROR: 502,
  INTERNAL_ERROR: 500,
};

/**
 * The only error type services throw. The Fastify error handler turns the code
 * into an HTTP status and the shared error envelope, so no service needs to know
 * about HTTP.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: ErrorDetail[];

  constructor(code: ErrorCode, message: string, details?: ErrorDetail[]) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }

  get status(): number {
    return STATUS_BY_CODE[this.code];
  }

  static validation(message: string, details?: ErrorDetail[]): AppError {
    return new AppError('VALIDATION_ERROR', message, details);
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError('UNAUTHORIZED', message);
  }

  static forbidden(message = 'Not allowed'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static conflict(message: string): AppError {
    return new AppError('CONFLICT', message);
  }

  static rateLimited(message = 'Too many requests'): AppError {
    return new AppError('RATE_LIMITED', message);
  }

  static aiProvider(message = 'The AI provider could not complete the request'): AppError {
    return new AppError('AI_PROVIDER_ERROR', message);
  }

  static internal(message = 'Something went wrong'): AppError {
    return new AppError('INTERNAL_ERROR', message);
  }
}
