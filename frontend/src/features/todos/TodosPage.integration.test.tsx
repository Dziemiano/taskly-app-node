import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AppProviders } from '../../app/AppProviders'
import { todoFixture } from '../../test/todoFixture'
import { TodosPage } from './TodosPage'

// Only presentation primitives are simplified. All feature components, HTTP,
// query/mutation hooks and query-cache updates execute their production code.
vi.mock('../../design-system', () => import('../../design-system/mocks'))
const fetchMock = vi.fn<typeof fetch>()
const clients: QueryClient[] = []
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  clients.forEach((client) => client.clear())
  clients.length = 0
  vi.unstubAllGlobals()
})
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  return {
    user: userEvent.setup(),
    ...render(
      <AppProviders client={client}>
        <TodosPage />
      </AppProviders>,
    ),
  }
}

it('fetches real task data and composes status/search filters without extra HTTP requests', async () => {
  const completed = {
    ...todoFixture,
    id: 8,
    title: 'Completed release',
    completed: true,
  }
  fetchMock.mockResolvedValueOnce(json([todoFixture, completed]))
  const { user } = setup()
  await screen.findByRole('heading', { name: todoFixture.title })
  await user.selectOptions(screen.getByLabelText('Status'), 'completed')
  expect(
    screen.queryByRole('heading', { name: todoFixture.title }),
  ).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: completed.title })).toBeVisible()
  await user.type(screen.getByLabelText('Search tasks'), 'missing')
  expect(
    screen.getByRole('heading', { name: 'No matching tasks' }),
  ).toBeVisible()
  expect(
    screen.queryByRole('button', { name: 'Add your first task' }),
  ).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('creates a task through the real editor, sends trimmed writable fields and updates the list', async () => {
  fetchMock.mockResolvedValueOnce(json([]))
  const { user } = setup()
  await screen.findByRole('heading', { name: 'Add your first task' })
  await user.click(screen.getByRole('button', { name: 'New task' }))
  const dialog = screen.getByRole('dialog', { name: 'New task' })
  await user.type(
    within(dialog).getByLabelText('Task title *'),
    '  New release  ',
  )
  await user.type(
    within(dialog).getByLabelText('Description (optional)'),
    '  Release details  ',
  )
  await user.selectOptions(within(dialog).getByLabelText('Priority'), 'high')
  fetchMock.mockResolvedValueOnce(
    json(
      {
        ...todoFixture,
        title: 'New release',
        description: 'Release details',
        priority: 'high',
      },
      201,
    ),
  )
  await user.click(within(dialog).getByRole('button', { name: 'Save task' }))
  await screen.findByRole('heading', { name: 'New release' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await screen.findByText('New task added.')).toBeVisible()
  expect(fetchMock).toHaveBeenLastCalledWith(
    '/api/todos',
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        title: 'New release',
        description: 'Release details',
        priority: 'high',
        due_date: null,
        completed: false,
      }),
    }),
  )
})

it('edits a task, preserves the editor/input on server failure and permits a successful retry', async () => {
  fetchMock.mockResolvedValueOnce(json([todoFixture]))
  const { user } = setup()
  await screen.findByRole('heading', { name: todoFixture.title })
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Edit task' })
  const title = within(dialog).getByLabelText('Task title *')
  await user.clear(title)
  await user.type(title, 'Edited release')
  fetchMock.mockResolvedValueOnce(json({ detail: 'Write unavailable' }, 503))
  await user.click(within(dialog).getByRole('button', { name: 'Save task' }))
  await within(dialog).findByText('Write unavailable')
  expect(title).toHaveValue('Edited release')
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  fetchMock.mockResolvedValueOnce(
    json({ ...todoFixture, title: 'Edited release' }),
  )
  await user.click(within(dialog).getByRole('button', { name: 'Save task' }))
  await screen.findByRole('heading', { name: 'Edited release' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await screen.findByText('Changes saved.')).toBeVisible()
  expect(fetchMock).toHaveBeenLastCalledWith(
    '/api/todos/7',
    expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({
        title: 'Edited release',
        description: '',
        priority: 'medium',
        due_date: null,
        completed: false,
      }),
    }),
  )
})

it('blocks actions during an in-flight update and toggles both completion directions after confirmation', async () => {
  fetchMock.mockResolvedValueOnce(json([todoFixture]))
  const { user } = setup()
  const checkbox = await screen.findByRole('checkbox', {
    name: `Complete: ${todoFixture.title}`,
  })
  let complete!: (value: Response) => void
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve
      }),
  )
  await user.click(checkbox)
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'New task' })).toBeDisabled(),
  )
  expect(checkbox).toBeDisabled()
  expect(checkbox).not.toBeChecked()
  complete(json({ ...todoFixture, completed: true }))
  await waitFor(() =>
    expect(
      screen.getByRole('checkbox', {
        name: `Mark as active: ${todoFixture.title}`,
      }),
    ).toBeChecked(),
  )
  expect(
    await screen.findByText('Another task complete. Well done!'),
  ).toBeVisible()
  fetchMock.mockResolvedValueOnce(json(todoFixture))
  await user.click(
    screen.getByRole('checkbox', {
      name: `Mark as active: ${todoFixture.title}`,
    }),
  )
  await waitFor(() =>
    expect(
      screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
    ).not.toBeChecked(),
  )
  expect(await screen.findByText('Task marked as active.')).toBeVisible()
})

it('keeps delete confirmation open after failure and removes the task only after successful retry', async () => {
  fetchMock.mockResolvedValueOnce(json([todoFixture]))
  const { user } = setup()
  await screen.findByRole('heading', { name: todoFixture.title })
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  )
  const dialog = screen.getByRole('dialog', { name: 'Delete task?' })
  fetchMock.mockResolvedValueOnce(json({ detail: 'Delete unavailable' }, 503))
  await user.click(within(dialog).getByRole('button', { name: 'Delete task' }))
  await within(dialog).findByText('Delete unavailable')
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
  await user.click(within(dialog).getByRole('button', { name: 'Delete task' }))
  await screen.findByRole('heading', { name: 'Add your first task' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await screen.findByText('Task deleted.')).toBeVisible()
  expect(fetchMock).toHaveBeenLastCalledWith(
    '/api/todos/7',
    expect.objectContaining({ method: 'DELETE' }),
  )
})

it('recovers from an initial list failure through the visible retry action', async () => {
  fetchMock.mockResolvedValueOnce(json({ detail: 'Read unavailable' }, 503))
  const { user } = setup()
  await screen.findByRole('heading', {
    name: 'The task list is temporarily unavailable',
  })
  expect(screen.getByTestId('alert')).toHaveTextContent('Read unavailable')
  fetchMock.mockResolvedValueOnce(json([todoFixture]))
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByRole('heading', { name: todoFixture.title })
  expect(screen.queryByTestId('alert')).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('aborts the list request when its last observer unmounts', async () => {
  fetchMock.mockImplementationOnce(() => new Promise(() => {}))
  const { unmount } = setup()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  const signal = fetchMock.mock.calls[0][1]?.signal
  expect(signal?.aborted).toBe(false)
  unmount()
  expect(signal?.aborted).toBe(true)
})

it('opens the empty-state creation action and cancels without sending a write', async () => {
  fetchMock.mockResolvedValueOnce(json([]))
  const { user } = setup()
  const create = await screen.findByRole('button', {
    name: 'Add your first task',
  })
  await user.click(create)
  const dialog = screen.getByRole('dialog', { name: 'New task' })
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('closes edit and delete dialogs without a mutation when the user cancels', async () => {
  fetchMock.mockResolvedValueOnce(json([todoFixture]))
  const { user } = setup()
  await screen.findByRole('heading', { name: todoFixture.title })
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  await user.click(
    within(screen.getByRole('dialog', { name: 'Edit task' })).getByRole(
      'button',
      { name: 'Close' },
    ),
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  )
  await user.click(
    within(screen.getByRole('dialog', { name: 'Delete task?' })).getByRole(
      'button',
      { name: 'Cancel' },
    ),
  )
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(fetchMock).toHaveBeenCalledTimes(1)
})

it('preserves the cached task after a rejected toggle and recovers through reset/refetch', async () => {
  fetchMock.mockResolvedValueOnce(json([todoFixture]))
  const { user } = setup()
  await screen.findByRole('heading', { name: todoFixture.title })
  fetchMock.mockResolvedValueOnce(json({ detail: 'Toggle unavailable' }, 503))
  await user.click(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  )
  await screen.findByText('Toggle unavailable')
  expect(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  ).not.toBeChecked()
  expect(
    screen.queryByText('Another task complete. Well done!'),
  ).not.toBeInTheDocument()
  fetchMock.mockResolvedValueOnce(json([{ ...todoFixture, completed: true }]))
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() =>
    expect(
      screen.getByRole('checkbox', {
        name: `Mark as active: ${todoFixture.title}`,
      }),
    ).toBeChecked(),
  )
  expect(screen.queryByText('Toggle unavailable')).not.toBeInTheDocument()
})
