import { useEffect, useState } from 'react'

import type { DiffFile, Discussion } from '../api/types'
import { DiffFileSection } from './DiffFileSection'
import { MODE_KEY, ReviewToolbar } from './ReviewToolbar'
import { preferredTheme, watchTheme } from './diffTheme'
import type { DiffMode } from './diffWorkerClient'
import type { SelectionRange } from './selection'

export interface DiffViewerProps {
  file: DiffFile
  discussions?: Discussion[]
  onSelectionChange?: (selection: SelectionRange | null) => void
}

/**
 * A single file with its own toolbar. The continuous review stream renders
 * sections directly; this keeps the one-file view available on its own.
 */
export function DiffViewer({
  file,
  discussions = [],
  onSelectionChange,
}: DiffViewerProps) {
  const [mode, setMode] = useState<DiffMode>(() =>
    localStorage.getItem(MODE_KEY) === 'split' ? 'split' : 'unified',
  )
  const [theme, setTheme] = useState(preferredTheme)
  const [showComments, setShowComments] = useState(false)
  const [inlineCount, setInlineCount] = useState(0)

  useEffect(() => watchTheme(setTheme), [])
  useEffect(() => setShowComments(false), [file.old_path, file.new_path])

  return (
    <>
      <ReviewToolbar
        inlineCount={inlineCount}
        mode={mode}
        showComments={showComments}
        onModeChange={setMode}
        onToggleComments={() => setShowComments((visible) => !visible)}
      />
      <DiffFileSection
        discussions={discussions}
        file={file}
        mode={mode}
        showComments={showComments}
        theme={theme}
        onInlineCountChange={setInlineCount}
        onRequestShowComments={() => setShowComments(true)}
        onSelectionChange={onSelectionChange}
      />
    </>
  )
}
