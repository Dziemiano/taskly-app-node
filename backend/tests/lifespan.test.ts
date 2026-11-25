import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { Server } from 'node:http';

const dependencies = vi.hoisted(() => ({ createDatabase: vi.fn(), initialize: vi.fn(), resolveDatabaseUrl: vi.fn(), createApp: vi.fn() }));
vi.mock('../src/core/database.js', () => ({ createDatabase: dependencies.createDatabase, initialize: dependencies.initialize }));
vi.mock('../src/core/config.js', () => ({ resolveDatabaseUrl: dependencies.resolveDatabaseUrl }));
vi.mock('../src/factory.js', () => ({ createApp: dependencies.createApp }));
import { start } from '../src/core/lifespan.ts';

let signals: Map<string, () => void>;
let db: { $connect: ReturnType<typeof vi.fn>; $disconnect: ReturnType<typeof vi.fn> };
let server: EventEmitter & { address: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
let listen: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubEnv('API_PORT', '');
  signals = new Map();
  vi.spyOn(process, 'once').mockImplementation(((event: string, listener: () => void) => {
    signals.set(event, listener);
    return process;
  }) as typeof process.once);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  db = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  server = Object.assign(new EventEmitter(), {
    address: vi.fn().mockReturnValue({ port: 8000 }),
    close: vi.fn((callback: () => Promise<void>) => { void callback(); }),
  });
  listen = vi.fn((_port: number, _host: string, callback: () => void) => {
    queueMicrotask(callback);
    return server as unknown as Server;
  });
  dependencies.resolveDatabaseUrl.mockReturnValue('postgresql://test/db');
  dependencies.createDatabase.mockReturnValue(db);
  dependencies.initialize.mockResolvedValue(undefined);
  dependencies.createApp.mockReturnValue({ listen });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.exitCode = undefined;
});

it('connects and initializes before listening and registers controlled shutdown handlers', async () => {
  const result = await start();
  expect(result).toEqual({ database: db, server });
  expect(dependencies.createDatabase).toHaveBeenCalledWith('postgresql://test/db');
  expect(db.$connect).toHaveBeenCalledOnce();
  expect(dependencies.initialize).toHaveBeenCalledWith(db);
  expect(db.$connect.mock.invocationCallOrder[0]).toBeLessThan(dependencies.initialize.mock.invocationCallOrder[0]);
  expect(dependencies.initialize.mock.invocationCallOrder[0]).toBeLessThan(listen.mock.invocationCallOrder[0]);
  expect(listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
  expect(signals.has('SIGINT')).toBe(true);
  expect(signals.has('SIGTERM')).toBe(true);
});
it('honors the configured listening port', async () => {
  vi.stubEnv('API_PORT', '8123');
  await start();
  expect(listen).toHaveBeenCalledWith(8123, '0.0.0.0', expect.any(Function));
});
it.each(['connect', 'initialize', 'listen'])('disconnects and preserves a startup failure at %s', async (phase) => {
  const failure = new Error(`${phase} failed`);
  if (phase === 'connect') db.$connect.mockRejectedValue(failure);
  if (phase === 'initialize') dependencies.initialize.mockRejectedValue(failure);
  if (phase === 'listen') listen.mockImplementation(() => { queueMicrotask(() => server.emit('error', failure)); return server; });
  await expect(start()).rejects.toBe(failure);
  expect(db.$disconnect).toHaveBeenCalledOnce();
  expect(signals.size).toBe(0);
});
it('closes HTTP and disconnects the database on termination, cancelling the deadline', async () => {
  await start();
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  signals.get('SIGTERM')!();
  await Promise.resolve();
  expect(server.close).toHaveBeenCalledOnce();
  expect(db.$disconnect).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(10001);
  expect(exit).not.toHaveBeenCalled();
});
it('records disconnect errors and marks shutdown unsuccessful', async () => {
  const failure = new Error('disconnect failed');
  db.$disconnect.mockRejectedValue(failure);
  await start();
  signals.get('SIGINT')!();
  await Promise.resolve();
  expect(console.error).toHaveBeenCalledWith(failure);
  expect(process.exitCode).toBe(1);
});
it('forces an unsuccessful exit when the HTTP server does not close within the deadline', async () => {
  server.close.mockImplementation(() => {});
  const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  await start();
  signals.get('SIGTERM')!();
  await vi.advanceTimersByTimeAsync(9999);
  expect(exit).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(exit).toHaveBeenCalledWith(1);
  expect(db.$disconnect).not.toHaveBeenCalled();
});
