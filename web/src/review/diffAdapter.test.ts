import { DiffFile as ParsedDiffFile } from '@git-diff-view/react'
import { expect, test } from 'vitest'

import type { DiffFile } from '../api/types'
import { synthesizeUnifiedDiff, toDiffData } from './diffAdapter'

const file: DiffFile = {
  old_path: 'src/parser.py',
  new_path: 'src/parser.py',
  diff: '@@ -1 +1 @@\n-old value\n+new value',
  new_file: false,
  renamed_file: false,
  deleted_file: false,
  collapsed: false,
  too_large: false,
}

test('synthesizes the file headers missing from GitLab hunks', () => {
  expect(synthesizeUnifiedDiff(file)).toContain(
    '--- a/src/parser.py\n+++ b/src/parser.py',
  )
})

test('the diff library parses one removed and one added line', () => {
  const parsed = ParsedDiffFile.createInstance(toDiffData(file))
  parsed.init()
  parsed.buildUnifiedDiffLines()

  expect(parsed.deletionLength).toBe(1)
  expect(parsed.additionLength).toBe(1)
})
