import { expect, it, vi } from 'vitest';
import { initialize } from '../src/core/database.ts';
import type { Database } from '../src/features/todos/types.ts';

it('initializes the table through the provided database and propagates SQL failures', async () => {
  const execute = vi.fn().mockResolvedValue(0);
  const db = { $executeRaw: execute } as unknown as Database;
  await initialize(db);
  expect(execute).toHaveBeenCalledOnce();
  expect(execute.mock.calls[0][0].join('')).toContain('CREATE TABLE IF NOT EXISTS todos');
  const failure = new Error('DDL permission denied');
  execute.mockRejectedValue(failure);
  await expect(initialize(db)).rejects.toBe(failure);
});
