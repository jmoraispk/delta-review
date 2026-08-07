import { useVirtualizer } from '@tanstack/react-virtual'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from 'react'

import type { DiffFile, Discussion } from '../api/types'
import { DiffFileSection } from './DiffFileSection'
import { MODE_KEY, ReviewToolbar } from './ReviewToolbar'
import { estimateSectionHeight } from './diffMetrics'
import { preferredTheme, watchTheme } from './diffTheme'
import type { DiffMode } from './diffWorkerClient'

/**
 * An explicit request to scroll to a file. The nonce distinguishes two
 * requests for the same file, and using a request rather than reacting to the
 * active index keeps the stream from scrolling to a file it reported itself.
 */
export interface ScrollRequest {
  index: number
  nonce: number
}

export interface DiffStreamProps {
  files: DiffFile[]
  discussions?: Discussion[]
  activeIndex: number
  scrollRequest?: ScrollRequest | null
  onActiveIndexChange: (index: number) => void
  scrollRef: RefObject<HTMLElement | null>
}

export function DiffStream({
  files,
  discussions = [],
  activeIndex,
  scrollRequest = null,
  onActiveIndexChange,
  scrollRef,
}: DiffStreamProps) {
  const [mode, setMode] = useState<DiffMode>(() =>
    localStorage.getItem(MODE_KEY) === 'split' ? 'split' : 'unified',
  )
  const [theme, setTheme] = useState(preferredTheme)
  const [showComments, setShowComments] = useState(false)
  const [inlineCounts, setInlineCounts] = useState<Record<number, number>>({})

  useEffect(() => watchTheme(setTheme), [])

  const estimates = useMemo(
    () => files.map((file) => estimateSectionHeight(file, mode)),
    [files, mode],
  )
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => estimates[index] ?? 200,
    overscan: 2,
    initialRect: { width: 900, height: 800 },
  })

  const inlineCount = useMemo(
    () => Object.values(inlineCounts).reduce((total, count) => total + count, 0),
    [inlineCounts],
  )

  const items = virtualizer.getVirtualItems()
  // Before the scroll container has a measured height the virtualizer yields
  // nothing. Render a small window in normal flow so the first paint, and any
  // environment without layout, still shows the file being read.
  const unmeasured = items.length === 0 && files.length > 0
  const fallbackWindow = useMemo(() => {
    if (!unmeasured) return []
    const first = Math.min(Math.max(0, activeIndex), files.length - 1)
    return Array.from({ length: 3 }, (_, offset) => first + offset).filter(
      (index) => index < files.length,
    )
  }, [activeIndex, files.length, unmeasured])

  // While scrolling to a rail selection the stream passes over other files.
  // Reporting those would retarget the scroll mid-flight, so stay quiet until
  // the requested file arrives.
  const scrollTargetRef = useRef<number | null>(null)

  // Declared before the reporting effect on purpose: effects run in
  // declaration order, and reporting first would push the active index back
  // to the top of the viewport before this scroll ever ran.
  useEffect(() => {
    if (!scrollRequest) return
    scrollTargetRef.current = scrollRequest.index
    // Set the offset directly rather than calling scrollToIndex: after a long
    // jump the virtualizer treats a repeat request for the same index as
    // already satisfied, and stops short of the file.
    const scroll = () => {
      const scroller = scrollRef.current
      const offset = virtualizer.getOffsetForIndex(
        scrollRequest.index,
        'start',
      )?.[0]
      if (scroller && offset !== undefined) scroller.scrollTop = offset
      else virtualizer.scrollToIndex(scrollRequest.index, { align: 'start' })
    }
    scroll()

    // Sections measure themselves as they mount, which shifts every offset
    // below them, so the first scroll lands near rather than on the file.
    // Once the section is actually mounted its real position is the truth, so
    // close the remaining gap from the DOM. A few frames, stopping the moment
    // it lands: corrections that linger move content the reader is using.
    // A long jump crosses hundreds of sections whose sizes only firm up as
    // they mount, so converge on a time budget rather than a frame count.
    let frame = 0
    let elapsed = 0
    const BUDGET_MS = 1_500
    const correct = () => {
      elapsed += 16
      const scroller = scrollRef.current
      const section = scroller?.querySelector<HTMLElement>(
        `[data-stream-index="${scrollRequest.index}"]`,
      )
      if (scroller && section) {
        const gap =
          section.getBoundingClientRect().top -
          scroller.getBoundingClientRect().top
        if (Math.abs(gap) <= 1) return
        scroller.scrollTop += gap
      } else {
        scroll()
      }
      if (elapsed < BUDGET_MS) frame = requestAnimationFrame(correct)
    }
    frame = requestAnimationFrame(correct)
    // Releasing on a timer keeps a scroll that never lands exactly on the
    // target from silencing the rail for good.
    const release = window.setTimeout(() => {
      scrollTargetRef.current = null
    }, BUDGET_MS + 500)

    // A correction that fires while the reader is aiming at a gutter would
    // pull the line out from under them, so any input cancels the rest.
    const scroller = scrollRef.current
    const abandon = () => {
      cancelAnimationFrame(frame)
      scrollTargetRef.current = null
    }
    const events = ['wheel', 'pointerdown', 'keydown'] as const
    for (const event of events) {
      scroller?.addEventListener(event, abandon, { passive: true })
    }

    return () => {
      cancelAnimationFrame(frame)
      window.clearTimeout(release)
      for (const event of events) {
        scroller?.removeEventListener(event, abandon)
      }
    }
  }, [scrollRef, scrollRequest, virtualizer])

  // The topmost section still on screen is the file being read. Overscanned
  // sections sit above the viewport, so skip anything that ends before it.
  const scrollOffset = virtualizer.scrollOffset ?? 0
  useEffect(() => {
    const first = items.find((item) => item.end > scrollOffset) ?? items[0]
    if (!first) return
    if (scrollTargetRef.current !== null) {
      if (first.index === scrollTargetRef.current) scrollTargetRef.current = null
      return
    }
    if (first.index !== activeIndex) onActiveIndexChange(first.index)
  }, [activeIndex, items, onActiveIndexChange, scrollOffset])

  // A zero-height measurement means the section is not laid out yet; taking
  // it would collapse the reserved space and wreck the scrollbar.
  const measureSection = useCallback(
    (element: HTMLElement | null) => {
      if (!element || element.getBoundingClientRect().height === 0) return
      virtualizer.measureElement(element)
    },
    [virtualizer],
  )

  const reportInlineCount = useCallback((index: number, count: number) => {
    setInlineCounts((current) =>
      current[index] === count ? current : { ...current, [index]: count },
    )
  }, [])

  return (
    <>
      <ReviewToolbar
        inlineCount={inlineCount}
        mode={mode}
        showComments={showComments}
        onModeChange={setMode}
        onToggleComments={() => setShowComments((visible) => !visible)}
      />
      <div
        className="diff-stream"
        style={
          unmeasured
            ? undefined
            : { height: virtualizer.getTotalSize(), position: 'relative' }
        }
      >
        {/*
         * One offset wrapper with the sections in normal flow. Positioning
         * each section absolutely at its estimated offset lets a mis-estimated
         * neighbour overlap it and swallow hovers meant for its gutter.
         */}
        <div
          className="diff-stream-window"
          style={
            unmeasured
              ? undefined
              : {
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${items[0]?.start ?? 0}px)`,
                }
          }
        >
          {(unmeasured
            ? fallbackWindow.map((index) => ({ index }))
            : items
          ).map((item) => {
            const file = files[item.index]
            if (!file) return null
            return (
              <div
                className="diff-stream-item"
                // Not data-file-index: the rail already owns that attribute.
                data-stream-index={item.index}
                data-index={item.index}
                key={`${file.old_path}:${file.new_path}`}
                ref={measureSection}
              >
                <DiffFileSection
                  discussions={discussions}
                  file={file}
                  mode={mode}
                  showComments={showComments}
                  theme={theme}
                  onInlineCountChange={(count) =>
                    reportInlineCount(item.index, count)
                  }
                  onRequestShowComments={() => setShowComments(true)}
                />
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
