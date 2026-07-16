import { performance } from 'node:perf_hooks'

import { DiffFile } from '@git-diff-view/core'

const fileCount = 50
const changedLinesPerFile = 100
const removed = Array.from(
  { length: changedLinesPerFile / 2 },
  (_, index) => `-const oldValue${index} = ${index}`,
)
const added = Array.from(
  { length: changedLinesPerFile / 2 },
  (_, index) => `+const newValue${index} = ${index + 1}`,
)
const hunk = [
  '@@ -1,50 +1,50 @@',
  ...removed,
  ...added,
].join('\n')

const startedAt = performance.now()
for (let index = 0; index < fileCount; index += 1) {
  const path = `src/benchmark-${index}.ts`
  const file = new DiffFile(
    path,
    '',
    path,
    '',
    [hunk],
    'typescript',
    'typescript',
  )
  file.initRaw()
  file.buildSplitDiffLines()
  file.buildUnifiedDiffLines()
}
const durationMs = performance.now() - startedAt

console.log(
  JSON.stringify({
    changedLines: fileCount * changedLinesPerFile,
    durationMs: Number(durationMs.toFixed(2)),
    files: fileCount,
    processing: 'parse + split + unified, syntax deferred',
  }),
)
