export type DiffSide = 'old' | 'new'

export interface LinePoint {
  oldLine: number | null
  newLine: number | null
  side: DiffSide
}

export interface SelectionRange {
  start: LinePoint
  end: LinePoint
}

export interface BackendSelection {
  old_path: string
  new_path: string
  start_old: number | null
  start_new: number | null
  end_old: number | null
  end_new: number | null
}

function selectedLine(point: LinePoint): number {
  const line =
    point.side === 'new'
      ? (point.newLine ?? point.oldLine)
      : (point.oldLine ?? point.newLine)
  if (line === null) {
    throw new Error('A selected diff point must include a line number')
  }
  return line
}

export function extendSelection(
  current: SelectionRange | null,
  point: LinePoint,
): SelectionRange {
  if (!current || current.start.side !== point.side) {
    return { start: point, end: point }
  }
  return selectedLine(point) < selectedLine(current.start)
    ? { start: point, end: current.start }
    : { start: current.start, end: point }
}

export function toBackendSelection(
  file: { old_path: string; new_path: string },
  selection: SelectionRange,
): BackendSelection {
  return {
    old_path: file.old_path,
    new_path: file.new_path,
    start_old: selection.start.oldLine,
    start_new: selection.start.newLine,
    end_old: selection.end.oldLine,
    end_new: selection.end.newLine,
  }
}
