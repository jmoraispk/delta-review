import { useVirtualizer } from '@tanstack/react-virtual'
import { useRef, type KeyboardEvent } from 'react'

import type { DiffFile } from '../api/types'

interface FileTreeProps {
  files: DiffFile[]
  activeIndex: number
  onSelect: (index: number) => void
  onFocusDiff: () => void
}

function fileStatus(file: DiffFile): string | null {
  if (file.too_large) return 'too large'
  if (file.collapsed) return 'collapsed'
  if (file.new_file) return 'new'
  if (file.deleted_file) return 'deleted'
  if (file.renamed_file) return 'renamed'
  return null
}

export function FileTree({
  files,
  activeIndex,
  onSelect,
  onFocusDiff,
}: FileTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 10,
    initialRect: { width: 280, height: 400 },
  })
  const virtualRows = virtualizer.getVirtualItems()
  const renderedRows =
    virtualRows.length > 0 || files.length === 0
      ? virtualRows
      : [
          {
            index: activeIndex,
            key: activeIndex,
            start: activeIndex * 32,
            size: 32,
          },
        ]

  function moveActive(event: KeyboardEvent, offset: number) {
    event.preventDefault()
    const next = Math.min(
      files.length - 1,
      Math.max(0, activeIndex + offset),
    )
    onSelect(next)
    virtualizer.scrollToIndex(next, { align: 'auto' })
    requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLButtonElement>(`[data-file-index="${next}"]`)
        ?.focus()
    })
  }

  function handleKeyboard(event: KeyboardEvent) {
    if (event.key === 'ArrowDown') moveActive(event, 1)
    if (event.key === 'ArrowUp') moveActive(event, -1)
    if (event.key === 'Enter') {
      event.preventDefault()
      onFocusDiff()
    }
  }

  return (
    <div
      className="file-list-scroll"
      ref={scrollRef}
      onKeyDown={handleKeyboard}
    >
      <nav
        className="virtual-file-list"
        style={{ height: virtualizer.getTotalSize() }}
      >
        {renderedRows.map((virtualRow) => {
          const file = files[virtualRow.index]
          const status = fileStatus(file)
          const isActive = virtualRow.index === activeIndex
          return (
            <button
              aria-current={isActive ? 'true' : undefined}
              className={`file-row ${isActive ? 'is-active' : ''}`}
              data-file-index={virtualRow.index}
              key={`${file.old_path}:${file.new_path}`}
              style={{
                height: virtualRow.size,
                transform: `translateY(${virtualRow.start}px)`,
              }}
              tabIndex={isActive ? 0 : -1}
              type="button"
              onClick={() => onSelect(virtualRow.index)}
            >
              <span className="file-glyph" aria-hidden="true">
                {isActive ? '◆' : '◇'}
              </span>
              <span className="file-path">{file.new_path}</span>
              {status ? <span className="file-status">{status}</span> : null}
            </button>
          )
        })}
      </nav>
    </div>
  )
}
