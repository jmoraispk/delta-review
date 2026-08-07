import type { DiffFile } from '../api/types'

/** Height of one rendered diff row at the viewer's 12px font size. */
export const DIFF_LINE_PX = 20

/** Header, padding, and borders that wrap every file section. */
export const SECTION_CHROME_PX = 96

export function diffLineCount(diff: string): number {
  if (!diff) return 0
  const trimmed = diff.endsWith('\n') ? diff.slice(0, -1) : diff
  return trimmed.split('\n').length
}

/**
 * Space to reserve for a section before its diff renders. The virtualizer
 * measures the real height once mounted, so this only has to be close.
 */
export function estimateSectionHeight(file: DiffFile): number {
  if (file.too_large || file.collapsed) return SECTION_CHROME_PX
  return SECTION_CHROME_PX + diffLineCount(file.diff) * DIFF_LINE_PX
}
