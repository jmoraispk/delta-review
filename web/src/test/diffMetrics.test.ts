import { expect, test } from 'vitest'

import type { DiffFile } from '../api/types'
import {
  DIFF_LINE_PX,
  SECTION_CHROME_PX,
  diffLineCount,
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

test('counts every rendered row including the hunk header', () => {
  const diff = '@@ -1,2 +1,2 @@\n-old\n+new\n context'
  expect(diffLineCount(diff)).toBe(4)
})

test('ignores the trailing newline a diff often carries', () => {
  expect(diffLineCount('@@ -1 +1 @@\n-old\n+new\n')).toBe(3)
})

test('counts nothing for an empty diff', () => {
  expect(diffLineCount('')).toBe(0)
})

test('estimates height from the line count plus fixed chrome', () => {
  const diff = ['@@ -1,3 +1,3 @@', '-a', '+b', '-c', '+d'].join('\n')
  expect(estimateSectionHeight(file({ diff }))).toBe(
    SECTION_CHROME_PX + 5 * DIFF_LINE_PX,
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
