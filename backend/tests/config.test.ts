import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const variables = ['DATABASE_URL', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'DB_PORT', 'POSTGRES_DB'];
beforeEach(() => { for (const name of variables) vi.stubEnv(name, undefined); });
afterEach(() => vi.unstubAllEnvs());

describe('database connection configuration', () => {
  it('prefers an explicit override and converts the legacy driver prefix', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://environment/db');
    expect(resolveDatabaseUrl('postgresql+psycopg://user:pass@host/db')).toBe('postgresql://user:pass@host/db');
  });
  it('uses DATABASE_URL when no override is provided', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql+psycopg://environment/db');
    expect(resolveDatabaseUrl()).toBe('postgresql://environment/db');
  });
  it('encodes reserved characters when assembling separate connection fields', () => {
    vi.stubEnv('POSTGRES_USER', 'a@b');
    vi.stubEnv('POSTGRES_PASSWORD', 'p:/?#');
    vi.stubEnv('POSTGRES_HOST', 'database');
    vi.stubEnv('DB_PORT', '5433');
    vi.stubEnv('POSTGRES_DB', 'tasks/archive');
    const url = new URL(resolveDatabaseUrl());
    expect(decodeURIComponent(url.username)).toBe('a@b');
    expect(decodeURIComponent(url.password)).toBe('p:/?#');
    expect(url.hostname).toBe('database');
    expect(url.port).toBe('5433');
    expect(url.pathname).toBe('/tasks%2Farchive');
  });
  it.each(variables.slice(1))('identifies a missing required field: %s', (missing) => {
    for (const name of variables.slice(1)) vi.stubEnv(name, name === missing ? '' : 'present');
    expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${missing}`);
  });
});
