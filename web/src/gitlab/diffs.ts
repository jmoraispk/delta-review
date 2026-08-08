import type { DiffFile, MergeRequest } from '../api/types'
import type { GitLabClient } from './client'
import { GitLabError } from './errors'

export function mergeRequestPath(project: string, iid: number): string {
  return `/projects/${encodeURIComponent(project)}/merge_requests/${iid}`
}

/** GitLab omits these booleans; the Pydantic models default them to false. */
function normaliseFile(raw: Record<string, unknown>): DiffFile {
  return {
    old_path: String(raw.old_path ?? ''),
    new_path: String(raw.new_path ?? ''),
    diff: String(raw.diff ?? ''),
    new_file: Boolean(raw.new_file),
    renamed_file: Boolean(raw.renamed_file),
    deleted_file: Boolean(raw.deleted_file),
    collapsed: Boolean(raw.collapsed),
    too_large: Boolean(raw.too_large),
  }
}

export async function getMergeRequest(
  client: GitLabClient,
  project: string,
  iid: number,
  signal?: AbortSignal,
): Promise<MergeRequest> {
  return client.request<MergeRequest>('GET', mergeRequestPath(project, iid), {
    signal,
  })
}

/**
 * Read every diff straight from the repository.
 *
 * GitLab applies its diff size budget across the whole merge request, so files
 * past the budget come back without any content and without a `too_large` or
 * `collapsed` flag. `access_raw_diffs` bypasses the budget. Returns null when
 * the retry is unavailable, leaving the truncated diffs in place rather than
 * losing them.
 */
async function rawChanges(
  client: GitLabClient,
  path: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>[] | null> {
  try {
    const payload = await client.request<{
      overflow?: boolean
      changes?: Record<string, unknown>[]
    }>('GET', `${path}/changes`, {
      params: { access_raw_diffs: 'true' },
      signal,
    })
    if (payload.overflow) return null
    return payload.changes?.length ? payload.changes : null
  } catch {
    return null
  }
}

export async function getDiffs(
  client: GitLabClient,
  project: string,
  iid: number,
  signal?: AbortSignal,
): Promise<DiffFile[]> {
  const path = mergeRequestPath(project, iid)
  let raw: Record<string, unknown>[]
  try {
    raw = await client.paginate<Record<string, unknown>>(`${path}/diffs`, signal)
    if (raw.some((file) => !file.diff)) {
      raw = (await rawChanges(client, path, signal)) ?? raw
    }
  } catch (error) {
    if (
      !(error instanceof GitLabError) ||
      (error.status !== 404 && error.status !== 500)
    ) {
      throw error
    }
    let payload = await client.request<{
      overflow?: boolean
      changes?: Record<string, unknown>[]
    }>('GET', `${path}/changes`, { signal })
    if (payload.overflow) {
      payload = await client.request('GET', `${path}/changes`, {
        params: { access_raw_diffs: 'true' },
        signal,
      })
      if (payload.overflow) {
        throw new GitLabError(
          422,
          'GitLab returned a truncated merge request diff',
          'diff_truncated',
        )
      }
    }
    raw = payload.changes ?? []
  }
  return raw.map(normaliseFile)
}
