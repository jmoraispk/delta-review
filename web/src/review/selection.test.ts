import { describe, expect, test } from 'vitest'

import { extendSelection, toBackendSelection } from './selection'

describe('extendSelection', () => {
  test('creates a contiguous new-side range', () => {
    const first = { oldLine: null, newLine: 12, side: 'new' as const }
    const second = { oldLine: null, newLine: 14, side: 'new' as const }
    expect(extendSelection(null, first)).toEqual({ start: first, end: first })
    expect(extendSelection({ start: first, end: first }, second)).toEqual({
      start: first,
      end: second,
    })
  })

  test('restarts when the user changes diff sides', () => {
    const oldLine = { oldLine: 8, newLine: null, side: 'old' as const }
    const newLine = { oldLine: null, newLine: 9, side: 'new' as const }
    expect(
      extendSelection({ start: oldLine, end: oldLine }, newLine),
    ).toEqual({ start: newLine, end: newLine })
  })

  test('normalizes a reverse context-line selection', () => {
    const later = { oldLine: 14, newLine: 16, side: 'new' as const }
    const earlier = { oldLine: 12, newLine: 14, side: 'new' as const }
    expect(
      extendSelection({ start: later, end: later }, earlier),
    ).toEqual({ start: earlier, end: later })
  })
})

test('converts selected coordinates for the backend', () => {
  const start = { oldLine: 10, newLine: 12, side: 'new' as const }
  const end = { oldLine: 11, newLine: 13, side: 'new' as const }
  expect(
    toBackendSelection(
      { old_path: 'a.py', new_path: 'a.py' },
      { start, end },
    ),
  ).toEqual({
    old_path: 'a.py',
    new_path: 'a.py',
    start_old: 10,
    start_new: 12,
    end_old: 11,
    end_new: 13,
  })
})
