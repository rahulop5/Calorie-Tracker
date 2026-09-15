import {
  errorResponseSchema,
  estimateNutritionInputSchema,
  estimateResultSchema,
  extractionResultSchema,
  importCandidatesSchema,
} from '@tracker/shared';
import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { AppError } from '../../common/errors';
import { env } from '../../config/env';
import { authGuard } from '../auth';
import { aiService } from './ai.service';
import type { ImageUpload } from './provider';

const IMAGE_TYPES: Record<string, ImageUpload['mediaType']> = {
  'image/jpeg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp',
};

/** Each call costs money, so these routes get their own tighter limit. */
const aiRateLimit = {
  rateLimit: { max: env.AI_RATE_LIMIT_PER_MINUTE, timeWindow: '1 minute' },
};

async function readUpload(
  request: FastifyRequest,
  limitBytes: number,
): Promise<{ file: MultipartFile; buffer: Buffer }> {
  let file: MultipartFile | undefined;

  try {
    file = await request.file({ limits: { fileSize: limitBytes } });
  } catch {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Send the file as multipart/form-data');
  }

  if (!file) {
    throw AppError.validation('No file was uploaded');
  }

  const buffer = await file.toBuffer();

  // @fastify/multipart truncates rather than throwing once the limit is hit.
  if (file.file.truncated) {
    throw new AppError(
      'PAYLOAD_TOO_LARGE',
      `That file is larger than ${Math.floor(limitBytes / 1_048_576)} MB`,
    );
  }

  if (buffer.length === 0) {
    throw AppError.validation('The uploaded file was empty');
  }

  return { file, buffer };
}

export const aiRoutes: FastifyPluginAsyncZod = async (app) => {
  app.addHook('preHandler', authGuard);

  app.post(
    '/extract-nutrition',
    {
      config: aiRateLimit,
      schema: {
        tags: ['AI'],
        summary: 'Read nutrition from a label or plate photo. Stores nothing.',
        consumes: ['multipart/form-data'],
        response: {
          200: extractionResultSchema,
          400: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { file, buffer } = await readUpload(request, env.AI_IMAGE_MAX_BYTES);
      const mediaType = IMAGE_TYPES[file.mimetype];

      if (!mediaType) {
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Upload a JPEG, PNG or WebP image');
      }

      const result = await aiService.extractFromImage({ data: buffer, mediaType });

      return reply.send(result);
    },
  );

  app.post(
    '/estimate-nutrition',
    {
      config: aiRateLimit,
      schema: {
        tags: ['AI'],
        summary: 'Estimate calories and macros from a food name. Stores nothing.',
        body: estimateNutritionInputSchema,
        response: {
          200: estimateResultSchema,
          400: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await aiService.estimate(request.body);

      return reply.send(result);
    },
  );

  app.post(
    '/import-pdf',
    {
      config: aiRateLimit,
      schema: {
        tags: ['AI'],
        summary: 'Parse a food diary PDF into candidate rows. Stores nothing.',
        consumes: ['multipart/form-data'],
        response: {
          200: z.object({ candidates: importCandidatesSchema }),
          400: errorResponseSchema,
          413: errorResponseSchema,
          415: errorResponseSchema,
          502: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { file, buffer } = await readUpload(request, env.AI_PDF_MAX_BYTES);

      if (file.mimetype !== 'application/pdf') {
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Upload a PDF');
      }

      const candidates = await aiService.parsePdf({ data: buffer, filename: file.filename });

      return reply.send({ candidates });
    },
  );
};
