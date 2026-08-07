import { useVirtualizer } from '@tanstack/react-virtual'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react'

import type { DiffFile } from '../api/types'
import { diffStats, diffStatsLabel } from './diffStats'
import { fileStatus } from './fileStatus'
import {
  ancestorPaths,
  buildFileTree,
  flattenTree,
  type TreeRow,
} from './fileTreeModel'

interface FileTreeProps {
  files: DiffFile[]
  activeIndex: number
  onSelect: (index: number) => void
  onFocusDiff: () => void
}

const ROW_HEIGHT = 30

function parentPath(row: TreeRow): string | null {
  const segments = row.path.split('/').filter(Boolean)
  if (row.kind === 'file') segments.pop()
  else segments.splice(-row.name.split('/').length)
  return segments.length ? segments.join('/') : null
}

export function FileTree({
  files,
  activeIndex,
  onSelect,
  onFocusDiff,
}: FileTreeProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const tree = useMemo(() => buildFileTree(files), [files])
  const rows = useMemo(
    () => flattenTree(tree, collapsed),
    [tree, collapsed],
  )
  const activeRowIndex = useMemo(
    () =>
      rows.findIndex(
        (row) => row.kind === 'file' && row.fileIndex === activeIndex,
      ),
    [rows, activeIndex],
  )
  const [focusedRow, setFocusedRow] = useState(0)

  // Never let the active file hide inside a collapsed directory.
  useEffect(() => {
    const active = files[activeIndex]
    if (!active) return
    const directory = (active.new_path || active.old_path)
      .split('/')
      .slice(0, -1)
      .join('/')
    if (!directory) return
    const ancestors = ancestorPaths(directory)
    setCollapsed((current) => {
      if (!ancestors.some((path) => current.has(path))) return current
      const next = new Set(current)
      for (const path of ancestors) next.delete(path)
      return next
    })
  }, [activeIndex, files])

  useEffect(() => {
    if (activeRowIndex >= 0) setFocusedRow(activeRowIndex)
  }, [activeRowIndex])

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    initialRect: { width: 280, height: 400 },
  })
  const virtualRows = virtualizer.getVirtualItems()
  const renderedRows =
    virtualRows.length > 0 || rows.length === 0
      ? virtualRows
      : rows.slice(0, 40).map((_, index) => ({
          index,
          key: index,
          start: index * ROW_HEIGHT,
          size: ROW_HEIGHT,
        }))

  const toggleDirectory = useCallback((path: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (!next.delete(path)) next.add(path)
      return next
    })
  }, [])

  const focusRowElement = useCallback((index: number) => {
    virtualizer.scrollToIndex(index, { align: 'auto' })
    requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector<HTMLButtonElement>(`[data-row-index="${index}"]`)
        ?.focus()
    })
  }, [virtualizer])

  function moveFocus(offset: number) {
    const next = Math.min(rows.length - 1, Math.max(0, focusedRow + offset))
    const row = rows[next]
    if (!row) return
    setFocusedRow(next)
    if (row.kind === 'file') onSelect(row.fileIndex)
    focusRowElement(next)
  }

  function moveToParent() {
    const row = rows[focusedRow]
    if (!row) return
    const parent = parentPath(row)
    if (parent === null) return
    const index = rows.findIndex(
      (candidate) => candidate.kind === 'dir' && candidate.path === parent,
    )
    if (index < 0) return
    setFocusedRow(index)
    focusRowElement(index)
  }

  function handleKeyboard(event: KeyboardEvent) {
    const row = rows[focusedRow]
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveFocus(1)
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveFocus(-1)
    }
    if (event.key === 'ArrowRight' && row?.kind === 'dir') {
      event.preventDefault()
      if (collapsed.has(row.path)) toggleDirectory(row.path)
      else moveFocus(1)
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (row?.kind === 'dir' && !collapsed.has(row.path))
        toggleDirectory(row.path)
      else moveToParent()
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (row?.kind === 'dir') toggleDirectory(row.path)
      else onFocusDiff()
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
          const row = rows[virtualRow.index]
          if (!row) return null
          const isFocused = virtualRow.index === focusedRow
          const indent = { paddingLeft: `${row.depth * 12 + 10}px` }
          const rowKey =
            row.kind === 'dir' ? `dir:${row.path}` : `file:${row.path}`
          const shared = {
            'data-row-index': virtualRow.index,
            style: {
              height: virtualRow.size,
              transform: `translateY(${virtualRow.start}px)`,
              ...indent,
            },
            tabIndex: isFocused ? 0 : -1,
          }

          if (row.kind === 'dir') {
            const isOpen = !collapsed.has(row.path)
            return (
              <button
                {...shared}
                key={rowKey}
                aria-expanded={isOpen}
                className="dir-row"
                type="button"
                onClick={() => {
                  setFocusedRow(virtualRow.index)
                  toggleDirectory(row.path)
                }}
              >
                <span className="dir-chevron" aria-hidden="true">
                  {isOpen ? '▾' : '▸'}
                </span>
                <span className="dir-name">{row.name}</span>
                <span className="dir-count" aria-hidden="true">
                  {row.fileCount}
                </span>
              </button>
            )
          }

          const status = fileStatus(row.file)
          const stats = diffStats(row.file.diff)
          const isActive = row.fileIndex === activeIndex
          return (
            <button
              {...shared}
              key={rowKey}
              aria-current={isActive ? 'true' : undefined}
              className={`file-row ${isActive ? 'is-active' : ''}`}
              data-file-index={row.fileIndex}
              type="button"
              onClick={() => {
                setFocusedRow(virtualRow.index)
                onSelect(row.fileIndex)
              }}
            >
              <span className="file-name" title={row.path}>
                {row.name}
              </span>
              <span className="file-row-meta">
                <span
                  className="file-diff-stats"
                  aria-label={diffStatsLabel(stats)}
                >
                  <span className="stat-addition" aria-hidden="true">
                    +{stats.additions}
                  </span>
                  <span className="stat-deletion" aria-hidden="true">
                    −{stats.deletions}
                  </span>
                </span>
                <span
                  className={`file-status-square ${status.variant}`}
                  title={status.label}
                  aria-label={status.label}
                >
                  <span aria-hidden="true">{status.glyph}</span>
                </span>
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
