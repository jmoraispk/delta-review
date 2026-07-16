import {
  DiffModeEnum,
  DiffView,
  SplitSide,
  type DiffFile as ParsedDiffFile,
} from '@git-diff-view/react'
import '@git-diff-view/react/styles/diff-view-pure.css'
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react'

import type { DiffFile } from '../api/types'
import { toDiffData } from './diffAdapter'
import {
  extendSelection,
  type DiffSide,
  type LinePoint,
  type SelectionRange,
} from './selection'

const MODE_KEY = 'delta-diff-mode'

interface DiffViewerRef {
  getDiffFileInstance: () => ParsedDiffFile | null
}

export interface DiffViewerProps {
  file: DiffFile
  onSelectionChange?: (selection: SelectionRange | null) => void
}

function preferredTheme(): 'light' | 'dark' {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

function selectionLine(point: LinePoint): number {
  return (
    (point.side === 'new' ? point.newLine : point.oldLine) ??
    point.newLine ??
    point.oldLine ??
    0
  )
}

export function DiffViewer({
  file,
  onSelectionChange,
}: DiffViewerProps) {
  const [mode, setMode] = useState<'unified' | 'split'>(() =>
    localStorage.getItem(MODE_KEY) === 'split' ? 'split' : 'unified',
  )
  const [theme, setTheme] = useState<'light' | 'dark'>(preferredTheme)
  const [highlight, setHighlight] = useState(false)
  const [selection, setSelection] = useState<SelectionRange | null>(null)
  const shiftPressed = useRef(false)
  const diffViewRef = useRef<DiffViewerRef>(null)

  useEffect(() => {
    setSelection(null)
  }, [file.old_path, file.new_path])

  useEffect(() => {
    setHighlight(false)
    const enableHighlight = () => setHighlight(true)
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(enableHighlight)
      return () => window.cancelIdleCallback(idleId)
    }
    const timeoutId = window.setTimeout(enableHighlight, 0)
    return () => window.clearTimeout(timeoutId)
  }, [file.old_path, file.new_path])

  useEffect(() => {
    onSelectionChange?.(selection)
  }, [onSelectionChange, selection])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const updateTheme = () => setTheme(media.matches ? 'light' : 'dark')
    media.addEventListener('change', updateTheme)
    return () => media.removeEventListener('change', updateTheme)
  }, [])

  function chooseMode(nextMode: 'unified' | 'split') {
    localStorage.setItem(MODE_KEY, nextMode)
    setMode(nextMode)
  }

  function pointForLine(lineNumber: number, side: SplitSide): LinePoint {
    const parsed = diffViewRef.current?.getDiffFileInstance()
    const line =
      mode === 'unified'
        ? parsed?.getUnifiedLineByLineNumber(lineNumber, side)
        : parsed?.getSplitLineByLineNumber(lineNumber, side)
    const diff = line?.diff
    const selectedSide: DiffSide =
      side === SplitSide.old ? 'old' : 'new'
    return {
      oldLine:
        diff?.oldLineNumber ??
        (selectedSide === 'old' ? lineNumber : null),
      newLine:
        diff?.newLineNumber ??
        (selectedSide === 'new' ? lineNumber : null),
      side: selectedSide,
    }
  }

  function selectLine(lineNumber: number, side: SplitSide) {
    const point = pointForLine(lineNumber, side)
    setSelection((current) =>
      extendSelection(shiftPressed.current ? current : null, point),
    )
    shiftPressed.current = false
  }

  function rememberModifier(event: MouseEvent<HTMLDivElement>) {
    shiftPressed.current = event.shiftKey
  }

  if (file.too_large || file.collapsed) {
    return (
      <section className="diff-stage unavailable-diff">
        <header className="diff-header">
          <strong>{file.new_path}</strong>
        </header>
        <div className="diff-explanation">
          <span aria-hidden="true">↯</span>
          <h2>Diff unavailable</h2>
          <p>
            {file.too_large
              ? 'This file is too large for GitLab to return through the diff API.'
              : 'This file was collapsed by GitLab. Open it in GitLab to inspect the full content.'}
          </p>
        </div>
      </section>
    )
  }

  const startLine = selection ? selectionLine(selection.start) : null
  const endLine = selection ? selectionLine(selection.end) : null

  return (
    <section className="diff-stage" aria-label={file.new_path}>
      <header className="diff-header">
        <div>
          <span className="language-dot" aria-hidden="true" />
          <strong>{file.new_path}</strong>
        </div>
        <div className="view-control" aria-label="Diff view">
          <button
            aria-pressed={mode === 'unified'}
            className={mode === 'unified' ? 'is-selected' : ''}
            type="button"
            onClick={() => chooseMode('unified')}
          >
            Unified
          </button>
          <button
            aria-pressed={mode === 'split'}
            className={mode === 'split' ? 'is-selected' : ''}
            type="button"
            onClick={() => chooseMode('split')}
          >
            Split
          </button>
        </div>
      </header>

      <div
        className="diff-library"
        onClickCapture={rememberModifier}
        onMouseDownCapture={rememberModifier}
      >
        <DiffView
          key={`${file.old_path}:${file.new_path}:${mode}:${theme}`}
          ref={diffViewRef}
          data={toDiffData(file)}
          diffViewMode={
            mode === 'split' ? DiffModeEnum.Split : DiffModeEnum.Unified
          }
          diffViewTheme={theme}
          diffViewHighlight={highlight}
          diffViewAddWidget
          diffViewFontSize={12}
          onAddWidgetClick={selectLine}
          renderWidgetLine={() => null}
        />
      </div>

      {selection && startLine !== null && endLine !== null ? (
        <div className="selection-draft" role="status">
          <span className="selection-pin" aria-hidden="true">
            +
          </span>
          <strong>
            {startLine === endLine
              ? `Selected line ${startLine}`
              : `Selected lines ${startLine}–${endLine}`}
          </strong>
          <span>Comment composer ready</span>
          <button type="button" onClick={() => setSelection(null)}>
            Clear
          </button>
        </div>
      ) : null}
    </section>
  )
}
