import { execFileSync } from 'node:child_process';
import { Client } from 'pg';
// vitest/node is ESM only, and this file compiles to CommonJS, so the type-only
// import has to say how to resolve it.
import type { TestProject } from 'vitest/node' with { 'resolution-mode': 'import' };

/**
 * globalSetup runs before `test.env` reaches the worker processes, so the
 * connection string has to come from the resolved config rather than
 * process.env. That keeps vitest.config.mts the single place it is defined.
 */
function readDatabaseUrl(project: TestProject): string {
  const fromConfig = project.config.env?.DATABASE_URL;
  const databaseUrl = fromConfig ?? process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. It is defined in vitest.config.mts.');
  }

  return databaseUrl;
}

/** Splits a connection string into the database name and an admin URL. */
function parseTarget(databaseUrl: string): { name: string; adminUrl: string } {
  const url = new URL(databaseUrl);
  const name = url.pathname.replace(/^\//, '');

  if (!name) {
    throw new Error(`DATABASE_URL has no database name: ${databaseUrl}`);
  }

  // Connect to the default database in order to create the test one.
  url.pathname = '/postgres';
  url.search = '';

  return { name, adminUrl: url.toString() };
}

async function createDatabaseIfMissing(name: string, adminUrl: string): Promise<void> {
  const admin = new Client({ connectionString: adminUrl });

  await admin.connect();

  try {
    const existing = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);

    if (existing.rowCount === 0) {
      // CREATE DATABASE cannot be parameterised. The name comes from our own
      // config, never from a request.
      await admin.query(`CREATE DATABASE "${name}"`);
    }
  } finally {
    await admin.end();
  }
}

/** Runs once before the whole suite: make the test database and migrate it. */
export default async function setup(project: TestProject): Promise<void> {
  const databaseUrl = readDatabaseUrl(project);
  const { name, adminUrl } = parseTarget(databaseUrl);

  await createDatabaseIfMissing(name, adminUrl);

  const env = { ...process.env, DATABASE_URL: databaseUrl };

  // Regenerate first. A client left over from a previous schema fails at runtime
  // with a confusing "column does not exist", which is not worth debugging twice.
  execFileSync('npx', ['prisma', 'generate'], { env, stdio: 'ignore' });
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], { env, stdio: 'ignore' });
}
