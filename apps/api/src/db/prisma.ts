import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { env, isProduction } from '../config/env';
import { softDeleteExtension } from './soft-delete';

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

const client = new PrismaClient({
  adapter,
  log: isProduction ? ['error'] : ['warn', 'error'],
});

/** The only database handle in the app. DAOs import this; nothing else does. */
export const prisma = client.$extends(softDeleteExtension);

export type Db = typeof prisma;

/** Used by the health check. Never throws, so a dead database is reportable. */
export async function pingDb(): Promise<boolean> {
  try {
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export async function disconnectDb(): Promise<void> {
  await client.$disconnect();
}
