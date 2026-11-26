import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TodoInput } from '../types'
import { todoFixture } from '../../../test/todoFixture'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'

const input: TodoInput = {
  title: 'Task',
  description: '',
  priority: 'medium',
  completed: false,
  due_date: null,
}
afterEach(() => vi.useRealTimers())

describe('task validation boundaries', () => {
  it('validates trimmed limits without mutating the form input', () => {
    const values = {
      ...input,
      title: `  ${'x'.repeat(120)}  `,
      description: ` ${'x'.repeat(2000)} `,
      due_date: '2024-02-29',
    }
    expect(validateTodo(values)).toEqual({})
    expect(values.title).toHaveLength(124)
    expect(values.description).toHaveLength(2002)
  })
  it.each(['', '   ', '\n\t'])(
    'rejects an empty trimmed title (%j)',
    (title) => {
      expect(validateTodo({ ...input, title })).toEqual({
        title: 'Enter a task title.',
      })
    },
  )
  it('reports multiple invalid fields together', () => {
    expect(
      validateTodo({
        ...input,
        title: 'x'.repeat(121),
        description: 'x'.repeat(2001),
        due_date: '2025-02-29',
      }),
    ).toEqual({
      title: 'The title must be at most 120 characters.',
      description: 'The description must be at most 2000 characters.',
      due_date: 'Enter a valid date.',
    })
  })
  it.each([
    '2026-02-30',
    '2025-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-1-01',
    'not-a-date',
    '2026-01-01T12:00:00Z',
  ])('rejects an invalid calendar date %s', (due_date) => {
    expect(validateTodo({ ...input, due_date }).due_date).toBe(
      'Enter a valid date.',
    )
  })
})

describe('task selection contracts', () => {
  it('selects completed tasks and searches titles without case or surrounding-space sensitivity', () => {
    const match = { ...todoFixture, completed: true, title: 'Release API' }
    expect(
      selectTodos(
        [
          match,
          { ...match, id: 8, completed: false },
          { ...match, id: 9, title: 'Other' },
        ],
        'completed',
        ' api ',
        'newest',
      ),
    ).toEqual([match])
  })
  it('orders due dates ascending, missing dates last, and equal dates by descending ID', () => {
    const missing = { ...todoFixture, id: 9 }
    const first = { ...todoFixture, id: 2, due_date: '2026-01-01' }
    const equal = { ...first, id: 3 }
    const later = { ...first, id: 4, due_date: '2026-01-02' }
    const values = [missing, first, later, equal]
    expect(selectTodos(values, 'all', '', 'due')).toEqual([
      equal,
      first,
      later,
      missing,
    ])
    expect(values).toEqual([missing, first, later, equal])
  })
  it('uses descending IDs to break equal priority and creation-time ties', () => {
    const first = { ...todoFixture, id: 1 }
    const second = { ...first, id: 2 }
    const newest = { ...first, id: 3, created_at: '2026-11-26T12:00:00Z' }
    expect(selectTodos([second, first], 'all', '', 'priority')).toEqual([
      second,
      first,
    ])
    expect(selectTodos([first, newest, second], 'all', '', 'newest')).toEqual([
      newest,
      second,
      first,
    ])
  })
  it('returns an empty list when no search/status matches or the source is empty', () => {
    expect(selectTodos([todoFixture], 'completed', '', 'newest')).toEqual([])
    expect(selectTodos([todoFixture], 'all', 'missing', 'due')).toEqual([])
    expect(selectTodos([], 'all', '', 'priority')).toEqual([])
  })
})

it('treats overdue as a local calendar-day boundary and excludes completed or undated tasks', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 26, 0, 1))
  expect(isOverdue({ ...todoFixture, due_date: '2026-11-25' })).toBe(true)
  expect(isOverdue({ ...todoFixture, due_date: '2026-11-26' })).toBe(false)
  expect(isOverdue({ ...todoFixture, due_date: '2026-11-27' })).toBe(false)
  expect(
    isOverdue({ ...todoFixture, due_date: '2026-11-25', completed: true }),
  ).toBe(false)
  expect(isOverdue(todoFixture)).toBe(false)
})

it('formats calendar dates using the documented British presentation', () => {
  expect(formatDate('2024-02-29')).toBe('29 Feb 2024')
})
