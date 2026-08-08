import { expect, test } from 'vitest'

import type { DiffFile } from '../api/types'
import {
  DIFF_LINE_PX,
  SECTION_CHROME_PX,
  diffLineCount,
  diffRowCounts,
  estimateSectionHeight,
} from '../review/diffMetrics'

function file(overrides: Partial<DiffFile> = {}): DiffFile {
  return {
    old_path: 'a.ts',
    new_path: 'a.ts',
    diff: '',
    new_file: false,
    renamed_file: false,
    deleted_file: false,
    collapsed: false,
    too_large: false,
    ...overrides,
  }
}

test('counts the rows a diff renders, not its hunk headers', () => {
  const diff = '@@ -1,2 +1,2 @@\n-old\n+new\n context'
  expect(diffLineCount(diff)).toBe(3)
})

test('ignores the trailing newline a diff often carries', () => {
  expect(diffLineCount('@@ -1 +1 @@\n-old\n+new\n')).toBe(2)
})

test('counts rows across several hunks', () => {
  const diff = '@@ -1 +1 @@\n-a\n+b\n@@ -9 +9 @@\n-c\n+d'
  expect(diffLineCount(diff)).toBe(4)
})

test('split view pairs removals with additions instead of stacking them', () => {
  const diff = '@@ -1,3 +1,3 @@\n context\n-a\n-b\n+c\n+d'
  expect(diffRowCounts(diff)).toEqual({ unified: 5, split: 3 })
})

test('split view follows whichever side is longer', () => {
  const diff = '@@ -1,4 +1,2 @@\n-a\n-b\n-c\n+d'
  expect(diffRowCounts(diff)).toEqual({ unified: 4, split: 3 })
})

test('estimates a shorter section for split view', () => {
  const diff = '@@ -1,2 +1,2 @@\n-a\n-b\n+c\n+d'
  expect(estimateSectionHeight(file({ diff }), 'split')).toBe(
    SECTION_CHROME_PX + 2 * DIFF_LINE_PX,
  )
  expect(estimateSectionHeight(file({ diff }), 'unified')).toBe(
    SECTION_CHROME_PX + 4 * DIFF_LINE_PX,
  )
})

test('counts nothing for an empty diff', () => {
  expect(diffLineCount('')).toBe(0)
})

test('estimates height from the rendered rows plus fixed chrome', () => {
  const diff = ['@@ -1,3 +1,3 @@', '-a', '+b', '-c', '+d'].join('\n')
  expect(estimateSectionHeight(file({ diff }))).toBe(
    SECTION_CHROME_PX + 4 * DIFF_LINE_PX,
  )
})

test('reserves only chrome for a file GitLab would not render', () => {
  expect(estimateSectionHeight(file({ too_large: true, diff: '' }))).toBe(
    SECTION_CHROME_PX,
  )
  expect(estimateSectionHeight(file({ collapsed: true, diff: '' }))).toBe(
    SECTION_CHROME_PX,
  )
})
