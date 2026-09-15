import path from 'node:path';
import { defineConfig, env } from '@prisma/config';
import { config as loadEnvFile } from 'dotenv';

// Prisma 7 no longer reads .env by itself, and the file lives at the repo root
// so the API and the web app share one copy.
loadEnvFile({ path: path.resolve(__dirname, '../../.env') });

// Only the CLI (migrate, studio) uses this config. The running app connects
// through a driver adapter instead, see src/db/prisma.ts.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
  },
});
