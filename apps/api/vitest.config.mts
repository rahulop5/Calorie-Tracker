import { defineConfig } from 'vitest/config';

// Tests use their own database so they can truncate freely without touching
// development data. global-setup.ts creates and migrates it from this URL.
const TEST_DATABASE_URL = 'postgresql://tracker:tracker@localhost:5432/tracker_test?schema=public';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // One shared database, and each test truncates it, so files must not overlap.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_SECRET: 'test-only-secret-at-least-32-characters-long',
      LOG_LEVEL: 'silent',
      // Pinned, because dotenv does not override variables already set and a
      // developer .env with LLM_PROVIDER=claude would otherwise point the suite
      // at the live API: slow, flaky, and billed per run.
      LLM_PROVIDER: 'stub',
    },
  },
});
