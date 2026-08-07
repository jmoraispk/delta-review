import type { GitLabClient } from './client'
import type { GitLabUser } from './user'

const PAGE_SIZE = 100

export interface MergeRequestSummary {
  id: number
  iid: number
  title: string
  web_url: string
  project_id: number
  references: { full: string }
  updated_at: string
  author: GitLabUser
  draft?: boolean
}

export interface MergeRequestPage {
  items: MergeRequestSummary[]
  /** True when GitLab may have more than this one page. */
  truncated: boolean
}

async function list(
  client: GitLabClient,
  params: Record<string, string>,
): Promise<MergeRequestPage> {
  const items = await client.request<MergeRequestSummary[]>(
    'GET',
    '/merge_requests',
    {
      params: {
        scope: 'all',
        state: 'opened',
        order_by: 'updated_at',
        per_page: String(PAGE_SIZE),
        ...params,
      },
    },
  )
  return { items, truncated: items.length >= PAGE_SIZE }
}

export function listReviewRequested(
  client: GitLabClient,
  userId: number,
): Promise<MergeRequestPage> {
  return list(client, { reviewer_id: String(userId) })
}

export function listAuthored(
  client: GitLabClient,
  userId: number,
): Promise<MergeRequestPage> {
  return list(client, { author_id: String(userId) })
}
