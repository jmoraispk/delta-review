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

export interface DiffStreamProps {
  files: DiffFile[]
  discussions?: Discussion[]
  activeIndex: number
  onActiveIndexChange: (index: number) => void
  scrollRef: RefObject<HTMLElement | null>
}

export function DiffStream({
  files,
  discussions = [],
  activeIndex,
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

  const estimates = useMemo(() => files.map(estimateSectionHeight), [files])
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

  // The topmost section still on screen is the file being read.
  useEffect(() => {
    const first = items[0]
    if (first && first.index !== activeIndex) onActiveIndexChange(first.index)
  }, [activeIndex, items, onActiveIndexChange])

  // Scroll only for a selection the stream did not report itself, so the
  // scroll-driven active index cannot bounce the view back.
  const requestedRef = useRef(activeIndex)
  useEffect(() => {
    if (requestedRef.current === activeIndex) return
    requestedRef.current = activeIndex
    virtualizer.scrollToIndex(activeIndex, { align: 'start' })
  }, [activeIndex, virtualizer])

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
        style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
      >
        {items.map((item) => {
          const file = files[item.index]
          if (!file) return null
          return (
            <div
              className="diff-stream-item"
              data-file-index={item.index}
              data-index={item.index}
              key={`${file.old_path}:${file.new_path}`}
              ref={measureSection}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${item.start}px)`,
              }}
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
    </>
  )
}
