import crypto from 'node:crypto';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import { registerErrorHandler } from './common/errors';
import { APP_VERSION, env, isTest } from './config/env';
import { aiRoutes } from './modules/ai';
import { authRoutes } from './modules/auth';
import { chatRoutes } from './modules/chat';
import { entriesRoutes } from './modules/entries';
import { goalsRoutes } from './modules/goals';
import { healthRoutes } from './modules/health/health.routes';
import { reportsRoutes } from './modules/reports';
import { weightsRoutes } from './modules/weights';

const API_PREFIX = '/api/v1';

const JSON_BODY_LIMIT_BYTES = 1_048_576;

export type BuildAppOptions = {
  /**
   * Off by default under NODE_ENV=test, so a test suite is not coupled to how
   * many requests it happens to make. The rate limit has its own test.
   */
  enableRateLimit?: boolean;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const enableRateLimit = options.enableRateLimit ?? !isTest;
  const app = Fastify({
    logger: isTest ? false : { level: env.LOG_LEVEL },
    // Every error response carries this id, so a user report maps to a log line.
    genReqId: () => crypto.randomUUID(),
    bodyLimit: JSON_BODY_LIMIT_BYTES,
  });

  // Zod validates requests and serialises responses, and the same schemas become
  // the OpenAPI document.
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  registerErrorHandler(app);

  await app.register(helmet, {
    // Responses are JSON; the only HTML we serve is the API reference page, and
    // its inline scripts would be blocked by the default policy.
    contentSecurityPolicy: false,
  });
  await app.register(cors, { origin: env.WEB_ORIGIN, credentials: true });
  await app.register(cookie);

  // Photo and PDF uploads. Per-route limits are applied when the file is read,
  // so one plugin serves both with different ceilings.
  await app.register(multipart, {
    limits: { files: 1, fileSize: Math.max(env.AI_IMAGE_MAX_BYTES, env.AI_PDF_MAX_BYTES) },
  });

  if (enableRateLimit) {
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
  }

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Personal Calorie Tracker API',
        version: APP_VERSION,
      },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: `${API_PREFIX}/auth` });
  await app.register(goalsRoutes, { prefix: `${API_PREFIX}/goals` });
  await app.register(weightsRoutes, { prefix: `${API_PREFIX}/weights` });
  await app.register(entriesRoutes, { prefix: `${API_PREFIX}/entries` });
  await app.register(reportsRoutes, { prefix: `${API_PREFIX}/reports` });
  await app.register(aiRoutes, { prefix: `${API_PREFIX}/ai` });
  await app.register(chatRoutes, { prefix: `${API_PREFIX}/chat` });

  return app;
}
