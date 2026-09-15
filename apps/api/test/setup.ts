import { afterAll, beforeEach } from 'vitest';
import { disconnectDb, prisma } from '../src/db';

// Every table hangs off users, so one truncate gives each test a clean slate.
beforeEach(async () => {
  await prisma.$executeRaw`TRUNCATE users RESTART IDENTITY CASCADE`;
});

afterAll(async () => {
  await disconnectDb();
});
