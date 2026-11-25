import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { PropsWithChildren } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import type { Todo } from '../types'
import { useCreateTodoMutation } from './useCreateTodoMutation'
import { useDeleteTodoMutation } from './useDeleteTodoMutation'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos', () => ({
  todosApi: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
const clients: QueryClient[] = []
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
  vi.resetAllMocks()
})

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return { client, wrapper }
}
const other: Todo = { ...todoFixture, id: 8, title: 'Another task' }

it('prepends a created task and replaces a duplicate server ID without losing other tasks', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [other, todoFixture])
  const saved = { ...todoFixture, title: 'Server-normalized title' }
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(todoFixture)
  })
  expect(todosApi.create).toHaveBeenCalledWith(todoFixture)
  expect(client.getQueryData(todoKeys.list)).toEqual([saved, other])
})

it('initializes an absent task cache after creation', async () => {
  const { client, wrapper } = setup()
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(todoFixture)
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture])
})

it('replaces only the updated task using the confirmed server response', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [other, todoFixture])
  const saved = { ...todoFixture, completed: true }
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({
      id: todoFixture.id,
      input: { completed: true },
    })
  })
  expect(todosApi.update).toHaveBeenCalledWith(todoFixture.id, {
    completed: true,
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([other, saved])
})

it('removes only the successfully deleted task', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [todoFixture, other])
  vi.mocked(todosApi.remove).mockResolvedValue(undefined)
  const { result } = renderHook(() => useDeleteTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync(todoFixture.id)
  })
  expect(todosApi.remove).toHaveBeenCalledWith(todoFixture.id)
  expect(client.getQueryData(todoKeys.list)).toEqual([other])
})

it('preserves cached tasks when a mutation fails', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [todoFixture, other])
  const error = new Error('Server unavailable')
  vi.mocked(todosApi.update).mockRejectedValue(error)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(async () => {
    await expect(
      result.current.mutateAsync({
        id: todoFixture.id,
        input: { completed: true },
      }),
    ).rejects.toBe(error)
  })
  expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture, other])
})

it('cancels an older list fetch so it cannot overwrite a confirmed update', async () => {
  const { client, wrapper } = setup()
  client.setQueryData(todoKeys.list, [todoFixture])
  let resolveOldFetch!: (todos: Todo[]) => void
  const oldFetch = client
    .fetchQuery({
      queryKey: todoKeys.list,
      queryFn: () =>
        new Promise<Todo[]>((resolve) => {
          resolveOldFetch = resolve
        }),
    })
    .catch(() => undefined)
  const saved = { ...todoFixture, completed: true }
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  await act(async () => {
    await result.current.mutateAsync({
      id: todoFixture.id,
      input: { completed: true },
    })
  })
  resolveOldFetch([todoFixture])
  await oldFetch
  expect(client.getQueryData(todoKeys.list)).toEqual([saved])
})

it.each(['update', 'delete'] as const)(
  'does not invent a task list after %s without a cached list',
  async (operation) => {
    const { client, wrapper } = setup()
    vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
    vi.mocked(todosApi.remove).mockResolvedValue(undefined)
    const { result } = renderHook(
      () => ({
        update: useUpdateTodoMutation(),
        remove: useDeleteTodoMutation(),
      }),
      { wrapper },
    )
    await act(async () => {
      if (operation === 'update')
        await result.current.update.mutateAsync({
          id: todoFixture.id,
          input: { title: 'Saved' },
        })
      else await result.current.remove.mutateAsync(todoFixture.id)
    })
    expect(client.getQueryData(todoKeys.list)).toBeUndefined()
  },
)
