import {
  DiffModeEnum,
  DiffView,
  SplitSide,
  DiffFile as ParsedDiffFile,
} from '@git-diff-view/react'
import '@git-diff-view/react/styles/diff-view-pure.css'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import type { DiffFile, Discussion } from '../api/types'
import { CommentComposer } from './CommentComposer'
import { toDiffData } from './diffAdapter'
import { diffStats, diffStatsLabel } from './diffStats'
import {
  clearDragHighlight,
  dragTargetFromElement,
  findCommentButton,
  highlightDragRange,
  type DragLineTarget,
} from './dragSelection'
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

interface ActiveDrag {
  pointerId: number
  start: DragLineTarget
  current: DragLineTarget
  moved: boolean
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

interface DiscussionExtensionData {
  oldFile: Record<string, { data: Discussion[] }>
  newFile: Record<string, { data: Discussion[] }>
}

function groupDiscussions(file: DiffFile, discussions: Discussion[]) {
  const oldFile: Record<string, { data: Discussion[] }> = {}
  const newFile: Record<string, { data: Discussion[] }> = {}
  let inlineCount = 0

  for (const discussion of discussions) {
    const position = discussionPosition(discussion)
    if (!position) continue
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
    inlineCount += 1
  }

  return { extendData: { oldFile, newFile }, inlineCount }
}

function WidgetCloseCapture({
  onClose,
  onReady,
}: {
  onClose: () => void
  onReady: (close: (() => void) | null) => void
}) {
  useEffect(() => {
    onReady(onClose)
    return () => onReady(null)
  }, [onClose, onReady])
  return null
}

type DiffData = ReturnType<typeof toDiffData>
type DiffBundle = ReturnType<ParsedDiffFile['_getFullBundle']>
type DiffTheme = 'light' | 'dark'

const processedDiffCache = new WeakMap<
  DiffFile,
  Partial<Record<DiffTheme, DiffBundle>>
>()
const EMPTY_EXTEND_DATA: DiscussionExtensionData = {
  oldFile: {},
  newFile: {},
}

function processDiff(
  data: DiffData,
  theme: 'light' | 'dark',
): ParsedDiffFile {
  const diffFile = ParsedDiffFile.createInstance(data)
  diffFile.initTheme(theme)
  diffFile.initRaw()
  diffFile.buildSplitDiffLines()
  diffFile.buildUnifiedDiffLines()
  return diffFile
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
  const [showComments, setShowComments] = useState(false)
  const [selection, setSelection] = useState<SelectionRange | null>(null)
  const [processedDiff, setProcessedDiff] =
    useState<ParsedDiffFile | null>(null)
  const shiftPressed = useRef(false)
  const activeDragRef = useRef<ActiveDrag | null>(null)
  const pendingDragSelectionRef = useRef<SelectionRange | null>(null)
  const diffViewRef = useRef<DiffViewerRef>(null)
  const diffLibraryRef = useRef<HTMLDivElement>(null)
  const widgetCloseRef = useRef<(() => void) | null>(null)
  const registerWidgetClose = useCallback(
    (close: (() => void) | null) => {
      widgetCloseRef.current = close
    },
    [],
  )
  const { extendData, inlineCount } = useMemo(
    () => groupDiscussions(file, discussions),
    [discussions, file],
  )
  const diffData = useMemo(
    () => toDiffData(file),
    [file],
  )
  const fileChanges = useMemo(() => diffStats(file.diff), [file.diff])

  useEffect(() => {
    let active = true
    setProcessedDiff(null)

    const cachedBundle = processedDiffCache.get(file)?.[theme]
    if (cachedBundle) {
      setProcessedDiff(
        ParsedDiffFile.createInstance(diffData, cachedBundle),
      )
      return
    }

    const rememberBundle = (bundle: DiffBundle) => {
      const bundles = processedDiffCache.get(file) ?? {}
      bundles[theme] = bundle
      processedDiffCache.set(file, bundles)
    }

    if (typeof Worker === 'undefined') {
      const parsed = processDiff(diffData, theme)
      rememberBundle(parsed._getFullBundle())
      setProcessedDiff(parsed)
      return
    }

    const worker = new Worker(
      new URL('./diffWorker.ts', import.meta.url),
      { type: 'module' },
    )
    const fallback = () => {
      worker.terminate()
      if (!active) return
      const parsed = processDiff(diffData, theme)
      rememberBundle(parsed._getFullBundle())
      setProcessedDiff(parsed)
    }
    const fallbackTimer = window.setTimeout(fallback, 2_000)
    worker.onmessage = (
      event: MessageEvent<{ bundle: DiffBundle }>,
    ) => {
      if (!active) return
      window.clearTimeout(fallbackTimer)
      rememberBundle(event.data.bundle)
      setProcessedDiff(
        ParsedDiffFile.createInstance(diffData, event.data.bundle),
      )
    }
    worker.onerror = fallback
    worker.onmessageerror = fallback
    worker.postMessage({ data: diffData, theme })

    return () => {
      active = false
      window.clearTimeout(fallbackTimer)
      worker.terminate()
    }
  }, [diffData, file, theme])

  useEffect(() => {
    setSelection(null)
    setShowComments(false)
    activeDragRef.current = null
    pendingDragSelectionRef.current = null
    if (diffLibraryRef.current) {
      clearDragHighlight(diffLibraryRef.current)
    }
  }, [file.old_path, file.new_path])

  useEffect(() => {
    setHighlight(false)
    if (!processedDiff) return
    const enableHighlight = () => setHighlight(true)
    if (typeof window.requestIdleCallback === 'function') {
      const idleId = window.requestIdleCallback(enableHighlight)
      return () => window.cancelIdleCallback(idleId)
    }
    const timeoutId = window.setTimeout(enableHighlight, 0)
    return () => window.clearTimeout(timeoutId)
  }, [processedDiff])

  useEffect(() => {
    onSelectionChange?.(selection)
  }, [onSelectionChange, selection])

  useEffect(() => {
    const root = diffLibraryRef.current
    if (!root) return

    const labelCommentButtons = () => {
      for (const button of root.querySelectorAll<HTMLButtonElement>(
        '.diff-add-widget',
      )) {
        const holder = button.closest<HTMLElement>(
          '[data-add-widget]',
        )
        const side = holder?.dataset.addWidget
        const line = button
          .closest('[data-state="diff"]')
          ?.querySelector<HTMLElement>(
            `[data-line-${side === 'old' ? 'old' : 'new'}-num]`,
          )
          ?.textContent?.trim()
        button.type = 'button'
        button.setAttribute(
          'aria-label',
          `Comment on ${side ?? 'diff'} line ${line ?? 'unknown'}`,
        )
      }
    }

    labelCommentButtons()
    const observer = new MutationObserver(labelCommentButtons)
    observer.observe(root, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [mode, processedDiff])

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const updateTheme = () => setTheme(media.matches ? 'light' : 'dark')
    media.addEventListener('change', updateTheme)
    return () => media.removeEventListener('change', updateTheme)
  }, [])

  function chooseMode(nextMode: 'unified' | 'split') {
    localStorage.setItem(MODE_KEY, nextMode)
    closeComposer()
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
    const draggedSelection = pendingDragSelectionRef.current
    if (draggedSelection) {
      pendingDragSelectionRef.current = null
      setSelection(draggedSelection)
      return
    }
    const point = pointForLine(lineNumber, side)
    const shouldExtend = shiftPressed.current
    setSelection((current) =>
      extendSelection(shouldExtend ? current : null, point),
    )
    shiftPressed.current = false
  }

  function selectionForWidget(
    lineNumber: number,
    side: SplitSide,
  ): SelectionRange {
    return (
      selection ??
      pendingDragSelectionRef.current ??
      extendSelection(null, pointForLine(lineNumber, side))
    )
  }

  function rememberModifier(event: MouseEvent<HTMLDivElement>) {
    shiftPressed.current = event.shiftKey
  }

  function closeComposer() {
    setSelection(null)
    activeDragRef.current = null
    pendingDragSelectionRef.current = null
    if (diffLibraryRef.current) {
      clearDragHighlight(diffLibraryRef.current)
    }
    widgetCloseRef.current?.()
    widgetCloseRef.current = null
  }

  function splitSide(target: DragLineTarget): SplitSide {
    return target.side === 'old' ? SplitSide.old : SplitSide.new
  }

  function rangeForDrag(
    start: DragLineTarget,
    end: DragLineTarget,
  ): SelectionRange {
    const initial = extendSelection(
      null,
      pointForLine(start.lineNumber, splitSide(start)),
    )
    return extendSelection(
      initial,
      pointForLine(end.lineNumber, splitSide(end)),
    )
  }

  function pointerTarget(
    event: ReactPointerEvent<HTMLDivElement>,
  ): DragLineTarget | null {
    const element = document.elementFromPoint(
      event.clientX,
      event.clientY,
    )
    return dragTargetFromElement(element ?? (event.target as Element))
  }

  function beginDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return
    const target = dragTargetFromElement(event.target as Element)
    if (!target) return

    closeComposer()
    activeDragRef.current = {
      pointerId: event.pointerId,
      start: target,
      current: target,
      moved: false,
    }
    highlightDragRange(event.currentTarget, target, target)
    event.currentTarget.setPointerCapture?.(event.pointerId)
    event.preventDefault()
  }

  function continueDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = activeDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const target = pointerTarget(event)
    if (!target || target.side !== drag.start.side) return

    drag.current = target
    drag.moved ||= target.lineNumber !== drag.start.lineNumber
    highlightDragRange(event.currentTarget, drag.start, target)
    event.preventDefault()
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = activeDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    activeDragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    event.preventDefault()

    if (!drag.moved) {
      clearDragHighlight(event.currentTarget)
      return
    }

    const range = rangeForDrag(drag.start, drag.current)
    const endpoint: DragLineTarget = {
      lineNumber: Math.max(
        drag.start.lineNumber,
        drag.current.lineNumber,
      ),
      side: drag.start.side,
    }
    pendingDragSelectionRef.current = range
    setSelection(range)

    requestAnimationFrame(() => {
      const root = diffLibraryRef.current
      const button = root && findCommentButton(root, endpoint)
      if (button) {
        button.dispatchEvent(
          new window.MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window,
          }),
        )
        return
      }
      pendingDragSelectionRef.current = null
      setSelection(null)
      if (root) clearDragHighlight(root)
    })
  }

  function cancelDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = activeDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    activeDragRef.current = null
    clearDragHighlight(event.currentTarget)
  }

  function focusPostedDiscussion(discussion: Discussion) {
    setShowComments(true)
    closeComposer()
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
          <strong title={file.new_path}>{file.new_path}</strong>
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

  if (!processedDiff) {
    return (
      <section
        className="diff-stage diff-loading"
        aria-label={file.new_path}
      >
        Preparing diff…
      </section>
    )
  }

  return (
    <>
      <div
        className="review-toolbar"
        role="toolbar"
        aria-label="Review controls"
      >
        {inlineCount > 0 ? (
          <button
            className="comment-visibility-toggle"
            aria-pressed={showComments}
            type="button"
            onClick={() => setShowComments((visible) => !visible)}
          >
            {showComments ? 'Hide' : 'Show'} inline comments ({inlineCount})
          </button>
        ) : null}
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
      </div>

      <section className="diff-stage" aria-label={file.new_path}>
      <header className="diff-header">
        <div className="diff-file-identity">
          <span className="language-dot" aria-hidden="true" />
          <strong title={file.new_path}>{file.new_path}</strong>
          <span
            className="file-header-stats"
            aria-label={`File changes: ${diffStatsLabel(fileChanges)}`}
          >
            <span className="stat-addition" aria-hidden="true">
              +{fileChanges.additions}
            </span>
            <span className="stat-deletion" aria-hidden="true">
              −{fileChanges.deletions}
            </span>
          </span>
        </div>
      </header>

      <div
        className="diff-library"
        ref={diffLibraryRef}
        onClickCapture={rememberModifier}
        onMouseDownCapture={rememberModifier}
        onPointerDownCapture={beginDrag}
        onPointerMoveCapture={continueDrag}
        onPointerUpCapture={endDrag}
        onPointerCancelCapture={cancelDrag}
      >
        <DiffView
          key={`${file.old_path}:${file.new_path}:${mode}:${theme}`}
          ref={diffViewRef}
          diffFile={processedDiff}
          diffViewMode={
            mode === 'split' ? DiffModeEnum.Split : DiffModeEnum.Unified
          }
          diffViewTheme={theme}
          diffViewHighlight={highlight}
          diffViewAddWidget
          diffViewFontSize={12}
          extendData={showComments ? extendData : EMPTY_EXTEND_DATA}
          onAddWidgetClick={selectLine}
          renderWidgetLine={({ lineNumber, side, onClose }) => (
            <div className="inline-comment-widget">
              <WidgetCloseCapture
                onClose={onClose}
                onReady={registerWidgetClose}
              />
              <CommentComposer
                selection={toBackendSelection(
                  file,
                  selectionForWidget(lineNumber, side),
                )}
                onCancel={closeComposer}
                onPosted={focusPostedDiscussion}
              />
            </div>
          )}
          renderExtendLine={({ data = [] }) => (
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
    </>
  )
}
