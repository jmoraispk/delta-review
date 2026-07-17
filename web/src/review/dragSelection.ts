import type { DiffSide } from './selection'

export interface DragLineTarget {
  lineNumber: number
  side: DiffSide
}

const SELECTED_CLASS = 'delta-drag-selected'

export function dragTargetFromElement(
  element: Element | null,
): DragLineTarget | null {
  if (
    !element ||
    element.closest('button, a, input, textarea, select')
  ) {
    return null
  }
  const gutter = element.closest<HTMLElement>(
    '.diff-line-num, .diff-line-old-num, .diff-line-new-num',
  )
  const marker =
    element.closest<HTMLElement>(
      '[data-line-old-num], [data-line-new-num], [data-line-num]',
    ) ??
    gutter?.querySelector<HTMLElement>(
      '[data-line-old-num], [data-line-new-num], [data-line-num]',
    )
  if (!marker || !gutter) {
    return null
  }

  const oldLine = marker.dataset.lineOldNum
  const newLine = marker.dataset.lineNewNum
  const splitLine = marker.dataset.lineNum
  const splitSide = marker.closest<HTMLElement>('.diff-line[data-side]')
    ?.dataset.side
  const side: DiffSide | null =
    splitLine == null
      ? newLine == null
        ? 'old'
        : 'new'
      : splitSide === 'old' || splitSide === 'new'
        ? splitSide
        : null
  const lineNumber = Number(newLine ?? oldLine ?? splitLine)
  if (!side) return null
  return Number.isInteger(lineNumber) && lineNumber > 0
    ? { lineNumber, side }
    : null
}

export function clearDragHighlight(root: HTMLElement): void {
  for (const row of root.querySelectorAll(`.${SELECTED_CLASS}`)) {
    row.classList.remove(SELECTED_CLASS)
  }
}

export function highlightDragRange(
  root: HTMLElement,
  start: DragLineTarget,
  end: DragLineTarget,
): void {
  clearDragHighlight(root)
  if (start.side !== end.side) return

  const minimum = Math.min(start.lineNumber, end.lineNumber)
  const maximum = Math.max(start.lineNumber, end.lineNumber)
  const unifiedAttribute =
    start.side === 'old' ? 'data-line-old-num' : 'data-line-new-num'
  const markers = [
    ...root.querySelectorAll<HTMLElement>(`[${unifiedAttribute}]`),
    ...root.querySelectorAll<HTMLElement>(
      `.diff-line[data-side="${start.side}"] [data-line-num]`,
    ),
  ]

  for (const marker of markers) {
    const lineNumber = Number(
      marker.getAttribute(unifiedAttribute) ??
        marker.getAttribute('data-line-num'),
    )
    if (lineNumber < minimum || lineNumber > maximum) continue
    marker.closest('.diff-line')?.classList.add(SELECTED_CLASS)
  }
}

export function findCommentButton(
  root: HTMLElement,
  target: DragLineTarget,
): HTMLButtonElement | null {
  const unifiedAttribute =
    target.side === 'old' ? 'data-line-old-num' : 'data-line-new-num'
  const marker =
    root.querySelector<HTMLElement>(
      `[${unifiedAttribute}="${target.lineNumber}"]`,
    ) ??
    root.querySelector<HTMLElement>(
      `.diff-line[data-side="${target.side}"] [data-line-num="${target.lineNumber}"]`,
    )
  return (
    marker
      ?.closest('.diff-line')
      ?.querySelector<HTMLButtonElement>(
        `[data-add-widget="${target.side}"] button`,
      ) ?? null
  )
}
