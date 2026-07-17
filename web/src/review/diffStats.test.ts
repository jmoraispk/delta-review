import { expect, test } from 'vitest'

import { diffStats } from './diffStats'

test('counts changed lines without counting diff metadata', () => {
  expect(
    diffStats(
      [
        '--- a/src/parser.ts',
        '+++ b/src/parser.ts',
        '@@ -1,3 +1,4 @@',
        ' context',
        '-old value',
        '+new value',
        '+another value',
      ].join('\n'),
    ),
  ).toEqual({ additions: 2, deletions: 1 })
})

test('counts whitespace-only changes', () => {
  expect(diffStats('@@ -1 +1 @@\n- \n+  ')).toEqual({
    additions: 1,
    deletions: 1,
  })
})

test('counts source lines that resemble diff headers', () => {
  expect(diffStats('@@ -1 +1 @@\n---flag\n+++counter')).toEqual({
    additions: 1,
    deletions: 1,
  })
})
