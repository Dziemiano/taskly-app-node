import { act, renderHook } from '@testing-library/react'
import { expect, it } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useTodoFilters } from './useTodoFilters'

it('composes filter, search and sort state and recomputes for fresh server data', () => {
  const first = {
    ...todoFixture,
    id: 1,
    title: 'API low',
    priority: 'low' as const,
  }
  const second = {
    ...first,
    id: 2,
    title: 'API high',
    priority: 'high' as const,
  }
  const { result, rerender } = renderHook(
    ({ todos }) => useTodoFilters(todos),
    { initialProps: { todos: [first, second] } },
  )
  expect(result.current.filter).toBe('all')
  expect(result.current.search).toBe('')
  expect(result.current.sort).toBe('newest')
  act(() => {
    result.current.setFilter('active')
    result.current.setSearch('api')
    result.current.setSort('priority')
  })
  expect(result.current.visible).toEqual([second, first])
  rerender({
    todos: [
      { ...second, completed: true },
      { ...first, title: 'Unrelated' },
    ],
  })
  expect(result.current.visible).toEqual([])
  expect(result.current.filter).toBe('active')
  expect(result.current.search).toBe('api')
  expect(result.current.sort).toBe('priority')
})
