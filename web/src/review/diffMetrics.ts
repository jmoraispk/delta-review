import type { DiffFile } from '../api/types'
import type { DiffMode } from './diffWorkerClient'

/**
 * Height of one rendered diff row at the viewer's 12px font size, measured in
 * the browser. An estimate even a few percent off drifts by thousands of
 * pixels across a large merge request, moving content under the reader as
 * sections measure themselves, so this is deliberately exact.
 */
export const DIFF_LINE_PX = 19.1875

/** Header, padding, and borders that wrap every file section. */
export const SECTION_CHROME_PX = 46

export interface RowCounts {
  unified: number
  split: number
}

/**
 * Rows a diff renders in each view mode. Hunk headers occupy no height of
 * their own. Unified stacks removals and additions; split lays them side by
 * side, so its height follows whichever side is longer.
 */
export function diffRowCounts(diff: string): RowCounts {
  if (!diff) return { unified: 0, split: 0 }
  const trimmed = diff.endsWith('\n') ? diff.slice(0, -1) : diff

  let additions = 0
  let deletions = 0
  let context = 0
  for (const line of trimmed.split('\n')) {
    if (line.startsWith('@@')) continue
    if (line.startsWith('+')) additions += 1
    else if (line.startsWith('-')) deletions += 1
    else context += 1
  }

  return {
    unified: additions + deletions + context,
    split: context + Math.max(additions, deletions),
  }
}

/** Rows a diff renders in unified view. */
export function diffLineCount(diff: string): number {
  return diffRowCounts(diff).unified
}

/**
 * Space to reserve for a section before its diff renders. The virtualizer
 * measures the real height once mounted, so this only has to be close.
 */
export function estimateSectionHeight(
  file: DiffFile,
  mode: DiffMode = 'unified',
): number {
  if (file.too_large || file.collapsed) return SECTION_CHROME_PX
  const rows = diffRowCounts(file.diff)
  const count = mode === 'split' ? rows.split : rows.unified
  return SECTION_CHROME_PX + count * DIFF_LINE_PX
}
