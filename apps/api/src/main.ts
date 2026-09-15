import { buildApp } from './app';
import { env } from './config/env';
import { disconnectDb } from './db';

async function start(): Promise<void> {
  const app = await buildApp();

  // Close the server and the database pool on the signals a host sends, so a
  // deploy does not drop in-flight requests.
  async function shutdown(signal: string): Promise<void> {
    app.log.info({ signal }, 'shutting down');

    try {
      await app.close();
      await disconnectDb();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'shutdown failed');
      process.exit(1);
    }
  }

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => void shutdown(signal));
  }

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (error) {
    app.log.error({ err: error }, 'failed to start');
    await disconnectDb();
    process.exit(1);
  }
}

void start();
