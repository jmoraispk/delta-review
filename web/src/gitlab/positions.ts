import type { BackendSelection } from '../review/selection'

export type DiffSelection = BackendSelection

export interface Version {
  base_sha: string
  start_sha: string
  head_sha: string
}

async function sha1Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-1',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function lineCode(
  path: string,
  oldLine: number | null,
  newLine: number | null,
): Promise<string> {
  return `${await sha1Hex(path)}_${oldLine ?? 0}_${newLine ?? 0}`
}

function lineType(
  oldLine: number | null,
  newLine: number | null,
): 'old' | 'new' | null {
  if (oldLine !== null && newLine !== null) return null
  return newLine !== null ? 'new' : 'old'
}

async function rangeEndpoint(
  path: string,
  oldLine: number | null,
  newLine: number | null,
): Promise<Record<string, unknown>> {
  const endpoint: Record<string, unknown> = {
    line_code: await lineCode(path, oldLine, newLine),
    type: lineType(oldLine, newLine),
  }
  if (oldLine !== null) endpoint.old_line = oldLine
  if (newLine !== null) endpoint.new_line = newLine
  return endpoint
}

export async function buildPosition(
  selection: DiffSelection,
  version: Version,
): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {
    position_type: 'text',
    base_sha: version.base_sha,
    start_sha: version.start_sha,
    head_sha: version.head_sha,
    old_path: selection.old_path,
    new_path: selection.new_path,
  }
  if (selection.end_old !== null) payload.old_line = selection.end_old
  if (selection.end_new !== null) payload.new_line = selection.end_new

  const isMultiline =
    selection.start_old !== selection.end_old ||
    selection.start_new !== selection.end_new
  if (isMultiline) {
    const path = selection.new_path || selection.old_path
    payload.line_range = {
      start: await rangeEndpoint(
        path,
        selection.start_old,
        selection.start_new,
      ),
      end: await rangeEndpoint(path, selection.end_old, selection.end_new),
    }
  }
  return payload
}

export async function buildLegacyPosition(
  selection: DiffSelection,
  version: Version,
): Promise<Record<string, unknown>> {
  const payload = await buildPosition(selection, version)
  for (const key of ['old_line', 'new_line'] as const) {
    const value = payload[key]
    if (value !== undefined && value !== null) payload[key] = String(value)
  }

  const lineRange = payload.line_range as
    | Record<'start' | 'end', Record<string, unknown>>
    | undefined
  if (!lineRange) return payload
  for (const name of ['start', 'end'] as const) {
    const endpoint = lineRange[name]
    for (const key of ['old_line', 'new_line'] as const) {
      const value = endpoint[key]
      endpoint[key] = value === undefined || value === null ? null : String(value)
    }
  }
  return payload
}
