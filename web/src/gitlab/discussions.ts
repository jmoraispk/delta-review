import type { Discussion, DiscussionNote, PostingResult } from '../api/types'
import type { GitLabClient } from './client'
import { mergeRequestPath } from './diffs'
import { GitLabError } from './errors'
import {
  buildLegacyPosition,
  buildPosition,
  type DiffSelection,
  type Version,
} from './positions'

const LADDER_STATUSES = new Set([400, 422])

function isLadderError(error: unknown): boolean {
  return error instanceof GitLabError && LADDER_STATUSES.has(error.status)
}

async function currentVersion(
  client: GitLabClient,
  project: string,
  iid: number,
): Promise<Version> {
  const path = mergeRequestPath(project, iid)
  const versions = await client.request<
    {
      base_commit_sha: string
      start_commit_sha: string
      head_commit_sha: string
    }[]
  >('GET', `${path}/versions`)
  if (!versions.length) {
    throw new GitLabError(409, 'The merge request has no diff version')
  }
  const current = versions[0]
  return {
    base_sha: current.base_commit_sha,
    start_sha: current.start_commit_sha,
    head_sha: current.head_commit_sha,
  }
}

function fallbackBody(selection: DiffSelection, body: string): string {
  const start = selection.start_new ?? selection.start_old
  const end = selection.end_new ?? selection.end_old
  const path = selection.new_path || selection.old_path
  const marker =
    end === start ? `📍 ${path}:${start}` : `📍 ${path}:${start}-${end}`
  return `${marker}\n\n${body}`
}

function placementOf(discussion: Discussion): 'inline' | 'general' {
  const position = discussion.notes?.[0]?.position
  return position != null ? 'inline' : 'general'
}

function lastLine(selection: DiffSelection): DiffSelection {
  return {
    old_path: selection.old_path,
    new_path: selection.new_path,
    start_old: selection.end_old,
    start_new: selection.end_new,
    end_old: selection.end_old,
    end_new: selection.end_new,
  }
}

function positionResult(
  discussion: Discussion,
  fallback: 'none' | 'final_line',
): PostingResult {
  const placement = placementOf(discussion)
  return placement === 'general'
    ? { placement, fallback: 'general', discussion }
    : { placement, fallback, discussion }
}

export async function getDiscussions(
  client: GitLabClient,
  project: string,
  iid: number,
  signal?: AbortSignal,
): Promise<Discussion[]> {
  return client.paginate<Discussion>(
    `${mergeRequestPath(project, iid)}/discussions`,
    signal,
  )
}

export async function createInline(
  client: GitLabClient,
  project: string,
  iid: number,
  selection: DiffSelection,
  body: string,
): Promise<PostingResult> {
  const discussionsPath = `${mergeRequestPath(project, iid)}/discussions`
  const version = await currentVersion(client, project, iid)
  const isMultiline =
    selection.start_old !== selection.end_old ||
    selection.start_new !== selection.end_new

  const post = (position: Record<string, unknown>) =>
    client.request<Discussion>('POST', discussionsPath, {
      json: { body, position },
    })

  try {
    return positionResult(
      await post(await buildPosition(selection, version)),
      'none',
    )
  } catch (error) {
    if (!isLadderError(error)) throw error
  }

  if (isMultiline) {
    try {
      return positionResult(
        await post(await buildLegacyPosition(selection, version)),
        'none',
      )
    } catch (error) {
      if (!isLadderError(error)) throw error
    }

    try {
      return positionResult(
        await post(await buildPosition(lastLine(selection), version)),
        'final_line',
      )
    } catch (error) {
      if (!isLadderError(error)) throw error
    }
  }

  const discussion = await client.request<Discussion>('POST', discussionsPath, {
    json: { body: fallbackBody(selection, body) },
  })
  return { placement: 'general', fallback: 'general', discussion }
}

function encodeDiscussionId(discussionId: string): string {
  if (!discussionId.trim()) {
    throw new Error('discussionId must not be empty')
  }
  return encodeURIComponent(discussionId)
}

export async function reply(
  client: GitLabClient,
  project: string,
  iid: number,
  discussionId: string,
  body: string,
): Promise<DiscussionNote> {
  const id = encodeDiscussionId(discussionId)
  return client.request<DiscussionNote>(
    'POST',
    `${mergeRequestPath(project, iid)}/discussions/${id}/notes`,
    { json: { body } },
  )
}

export async function setResolved(
  client: GitLabClient,
  project: string,
  iid: number,
  discussionId: string,
  resolved: boolean,
): Promise<Discussion> {
  const id = encodeDiscussionId(discussionId)
  return client.request<Discussion>(
    'PUT',
    `${mergeRequestPath(project, iid)}/discussions/${id}`,
    { json: { resolved } },
  )
}
