import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from './http'

const fetchMock = vi.fn<typeof fetch>()
beforeEach(() => vi.stubGlobal('fetch', fetchMock))
afterEach(() => {
  fetchMock.mockReset()
  vi.unstubAllGlobals()
})

it('prefixes API paths, preserves request options and allows header overrides', async () => {
  const signal = new AbortController().signal
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 1 })))
  await expect(
    request('/todos', {
      method: 'POST',
      body: '{}',
      signal,
      headers: { 'Content-Type': 'application/custom', 'X-Request-ID': 'test' },
    }),
  ).resolves.toEqual({ id: 1 })
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    method: 'POST',
    body: '{}',
    signal,
    headers: { 'Content-Type': 'application/custom', 'X-Request-ID': 'test' },
  })
})

it('returns undefined for a successful empty response', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  await expect(
    request('/todos/1', { method: 'DELETE' }),
  ).resolves.toBeUndefined()
})

it('explains connection failures without exposing transport details', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('preserves an aborted request error so cancellation is not shown as a connection failure', async () => {
  const controller = new AbortController()
  controller.abort()
  const error = new DOMException('Aborted', 'AbortError')
  fetchMock.mockRejectedValue(error)
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    error,
  )
})

it('provides actionable validation guidance for 422 responses', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ detail: [{ message: 'Invalid' }] }), {
      status: 422,
    }),
  )
  await expect(request('/todos')).rejects.toThrow(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('shows a server-provided string error', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ detail: 'Task not found.' }), {
      status: 404,
    }),
  )
  await expect(request('/todos/99')).rejects.toThrow('Task not found.')
})

it.each([
  'not json',
  JSON.stringify({ detail: ['private diagnostic'] }),
  JSON.stringify({}),
])(
  'uses a safe fallback for an unreadable or non-string error body (%s)',
  async (body) => {
    fetchMock.mockResolvedValue(new Response(body, { status: 500 }))
    await expect(request('/todos')).rejects.toThrow(
      'The operation failed. Please try again.',
    )
  },
)
