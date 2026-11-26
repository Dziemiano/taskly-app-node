import { afterEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/factory.ts';
import { createDatabase } from '../src/core/database.ts';

const database = () => createDatabase('postgresql://test:test@localhost:5432/test');
afterEach(() => vi.restoreAllMocks());

it('reports health after checking database access and hides framework headers', async () => {
  const db = database();
  const findFirst = vi.spyOn(db.todo, 'findFirst').mockResolvedValue(null);
  const response = await request(createApp(db)).get('/api/health');
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ status: 'ok' });
  expect(response.headers['x-powered-by']).toBeUndefined();
  expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
});
it('maps unexpected database failures to a generic 500 without leaking details', async () => {
  const db = database();
  const failure = new Error('private database connection details');
  vi.spyOn(db.todo, 'findFirst').mockRejectedValue(failure);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await request(createApp(db)).get('/api/health');
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(log).toHaveBeenCalledWith(failure);
});
it('returns a JSON 404 for unknown endpoints', async () => {
  const response = await request(createApp(database())).get('/unknown');
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Not Found' });
});
it('serves the OpenAPI document and documentation page', async () => {
  const app = createApp(database());
  const specification = await request(app).get('/openapi.json');
  expect(specification.status).toBe(200);
  expect(specification.body.paths['/api/todos']).toBeDefined();
  const docs = await request(app).get('/docs/');
  expect(docs.status).toBe(200);
  expect(docs.type).toBe('text/html');
  expect(docs.text).toContain('swagger-ui');
});
it('rejects malformed JSON with the public validation error', async () => {
  const response = await request(createApp(database())).post('/api/todos').set('Content-Type', 'application/json').send('{');
  expect(response.status).toBe(422);
  expect(response.body).toEqual({ detail: 'Invalid JSON.' });
});
it('rejects oversized request bodies before reaching a database operation', async () => {
  const db = database();
  const create = vi.spyOn(db.todo, 'create');
  const response = await request(createApp(db)).post('/api/todos').send({ title: 'x'.repeat(110 * 1024) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ detail: 'Request body too large.' });
  expect(create).not.toHaveBeenCalled();
});

it.each([
  { method: 'get', path: '/api/todos', delegate: 'findMany', body: undefined },
  { method: 'get', path: '/api/todos/1', delegate: 'findUnique', body: undefined },
  { method: 'post', path: '/api/todos', delegate: 'create', body: { title: 'Valid task' } },
  { method: 'patch', path: '/api/todos/1', delegate: 'updateManyAndReturn', body: { completed: true } },
  { method: 'delete', path: '/api/todos/1', delegate: 'deleteMany', body: undefined },
] as const)('returns a generic error when $method $path rejects, without leaking database details', async ({ method, path, delegate, body }) => {
  const db = database();
  const failure = new Error('private SQL credentials and internal query text');
  vi.spyOn(db.todo, delegate).mockRejectedValue(failure);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const response = await request(createApp(db))[method](path).send(body);
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ detail: 'Internal Server Error' });
  expect(response.text).not.toContain(failure.message);
  expect(log).toHaveBeenCalledWith(failure);
});
