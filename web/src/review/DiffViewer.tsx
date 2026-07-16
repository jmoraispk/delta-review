import {
  DiffModeEnum,
  DiffView,
  SplitSide,
  type DiffFile as ParsedDiffFile,
} from '@git-diff-view/react'
import '@git-diff-view/react/styles/diff-view-pure.css'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react'

import type { DiffFile, Discussion } from '../api/types'
import { CommentComposer } from './CommentComposer'
import { toDiffData } from './diffAdapter'
import { DiscussionThread } from './DiscussionThread'
import {
  extendSelection,
  toBackendSelection,
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
  discussions?: Discussion[]
  onSelectionChange?: (selection: SelectionRange | null) => void
}

function preferredTheme(): 'light' | 'dark' {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark'
}

function discussionPosition(discussion: Discussion) {
  return discussion.notes.find((note) => note.position)?.position ?? null
}

function groupDiscussions(file: DiffFile, discussions: Discussion[]) {
  const oldFile: Record<string, { data: Discussion[] }> = {}
  const newFile: Record<string, { data: Discussion[] }> = {}
  const general: Discussion[] = []

  for (const discussion of discussions) {
    const position = discussionPosition(discussion)
    if (!position) {
      general.push(discussion)
      continue
    }
    const belongsToFile =
      position.new_path === file.new_path ||
      position.old_path === file.old_path
    if (!belongsToFile) continue

    const side = position.new_line != null ? newFile : oldFile
    const lineNumber = position.new_line ?? position.old_line
    if (lineNumber == null) continue
    const key = String(lineNumber)
    side[key] = {
      data: [...(side[key]?.data ?? []), discussion],
    }
  }

  return { extendData: { oldFile, newFile }, general }
}

export function DiffViewer({
  file,
  discussions = [],
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
  const { extendData, general } = useMemo(
    () => groupDiscussions(file, discussions),
    [discussions, file],
  )

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
    setSelection(null)
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

  function focusPostedDiscussion(
    discussion: Discussion,
    closeWidget: () => void,
  ) {
    setSelection(null)
    closeWidget()
    requestAnimationFrame(() => {
      const thread = Array.from(
        document.querySelectorAll<HTMLElement>('[data-discussion-id]'),
      ).find(
        (element) =>
          element.dataset.discussionId === discussion.id,
      )
      thread?.focus()
    })
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

      {general.length > 0 ? (
        <section className="general-discussions" aria-label="General discussions">
          <div className="general-heading">
            <span className="eyebrow">General placement</span>
            <strong>
              {general.length} {general.length === 1 ? 'discussion' : 'discussions'}
            </strong>
          </div>
          {general.map((discussion) => (
            <DiscussionThread
              discussion={discussion}
              key={discussion.id}
            />
          ))}
        </section>
      ) : null}

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
          extendData={extendData}
          onAddWidgetClick={selectLine}
          renderWidgetLine={({ onClose }) =>
            selection ? (
              <CommentComposer
                selection={toBackendSelection(file, selection)}
                onCancel={() => {
                  setSelection(null)
                  onClose()
                }}
                onPosted={(discussion) =>
                  focusPostedDiscussion(discussion, onClose)
                }
              />
            ) : null
          }
          renderExtendLine={({ data }) => (
            <div className="line-discussions">
              {data.map((discussion) => (
                <DiscussionThread
                  discussion={discussion}
                  key={discussion.id}
                />
              ))}
            </div>
          )}
        />
      </div>
    </section>
  )
}
