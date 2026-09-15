import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnvFile } from 'dotenv';
import { z } from 'zod';

// The .env file sits at the repo root so the API and the web app share one copy.
// Walking up finds it whether we run from src (tsx) or dist (node).
// In production the host supplies real environment variables and no file exists.
function findEnvFile(): string | undefined {
  let dir = __dirname;

  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(dir, '.env');
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    dir = path.dirname(dir);
  }

  return undefined;
}

const envFile = findEnvFile();
if (envFile) {
  // Does not override variables the host already set.
  loadEnvFile({ path: envFile, quiet: true });
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().min(1).default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  DATABASE_URL: z.string().min(1),

  // No default on purpose. A fallback secret is the kind of thing that reaches
  // production unnoticed.
  JWT_SECRET: z.string().min(32),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  WEB_ORIGIN: z.string().min(1).default('http://localhost:5173'),

  // --- AI ---
  // `stub` answers from fixed rules and needs no credentials, so the app stays
  // runnable without a key. `claude` reads credentials from the environment.
  LLM_PROVIDER: z.enum(['stub', 'claude']).default('stub'),
  // Haiku for both paths, pinned to a dated id so a model alias moving under us
  // cannot change behaviour or cost without a deploy. Chat is the one that would
  // benefit from a stronger tier; it is a per-deployment call, hence the env var.
  AI_MODEL_EXTRACTION: z.string().min(1).default('claude-haiku-4-5-20251001'),
  AI_MODEL_CHAT: z.string().min(1).default('claude-haiku-4-5-20251001'),

  AI_IMAGE_MAX_BYTES: z.coerce.number().int().positive().default(8_388_608),
  AI_PDF_MAX_BYTES: z.coerce.number().int().positive().default(15_728_640),

  /** Tool-calling rounds per message, so a confused model cannot loop forever. */
  AI_CHAT_MAX_TURNS: z.coerce.number().int().min(1).max(20).default(8),
  /** History replayed to the model, by stored token_count. */
  AI_CHAT_TOKEN_BUDGET: z.coerce.number().int().positive().default(12_000),
  /** Requests per minute on the AI routes, which cost money per call. */
  AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const problems = parsed.error.issues
    .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment configuration:\n${problems}`);
}

export const env = parsed.data;
export type Env = typeof env;

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

export const APP_VERSION = '0.1.0';
