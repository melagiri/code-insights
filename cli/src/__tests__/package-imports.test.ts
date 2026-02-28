import { describe, it, expect } from 'vitest';

describe('package imports', () => {
  it('hono and @hono/node-server are resolvable', async () => {
    await expect(import('hono')).resolves.toBeDefined();
    await expect(import('@hono/node-server')).resolves.toBeDefined();
  });

  it('better-sqlite3 is resolvable', async () => {
    await expect(import('better-sqlite3')).resolves.toBeDefined();
  });

  it('all CLI dependencies are importable', async () => {
    await expect(import('chalk')).resolves.toBeDefined();
    await expect(import('commander')).resolves.toBeDefined();
    await expect(import('ora')).resolves.toBeDefined();
  });
});
