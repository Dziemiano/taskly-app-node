import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useNotice } from './useNotice'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('starts empty, displays a notice and dismisses it after four seconds', () => {
  const { result } = renderHook(() => useNotice())
  expect(result.current.message).toBe('')
  act(() => result.current.notify('Task saved'))
  expect(result.current.message).toBe('Task saved')
  act(() => vi.advanceTimersByTime(3999))
  expect(result.current.message).toBe('Task saved')
  act(() => vi.advanceTimersByTime(1))
  expect(result.current.message).toBe('')
})

it('gives a replacement notice a full lifetime, including repeated messages', () => {
  const { result } = renderHook(() => useNotice())
  act(() => result.current.notify('Task saved'))
  act(() => vi.advanceTimersByTime(3000))
  act(() => result.current.notify('Task saved'))
  act(() => vi.advanceTimersByTime(1000))
  expect(result.current.message).toBe('Task saved')
  act(() => vi.advanceTimersByTime(3000))
  expect(result.current.message).toBe('')
})

it('cancels the pending dismissal on unmount', () => {
  const { result, unmount } = renderHook(() => useNotice())
  act(() => result.current.notify('Task saved'))
  expect(vi.getTimerCount()).toBe(1)
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
