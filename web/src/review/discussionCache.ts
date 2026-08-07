import type { QueryClient } from '@tanstack/react-query'

import type { Discussion } from '../api/types'

export const discussionsQueryKey = (targetKey: string) =>
  ['discussions', targetKey] as const

export const pendingDiscussionsQueryKey = (targetKey: string) =>
  ['discussions', targetKey, 'pending'] as const

function upsertDiscussion(
  discussions: Discussion[],
  discussion: Discussion,
): Discussion[] {
  const index = discussions.findIndex((value) => value.id === discussion.id)
  if (index < 0) return [...discussions, discussion]
  return discussions.map((value, current) =>
    current === index ? discussion : value,
  )
}

export function recordPostedDiscussion(
  queryClient: QueryClient,
  targetKey: string,
  discussion: Discussion,
) {
  queryClient.setQueryData<Discussion[]>(
    pendingDiscussionsQueryKey(targetKey),
    (values = []) => upsertDiscussion(values, discussion),
  )
  queryClient.setQueryData<Discussion[]>(
    discussionsQueryKey(targetKey),
    (values = []) => upsertDiscussion(values, discussion),
  )
}

export function mergeFetchedDiscussions(
  queryClient: QueryClient,
  targetKey: string,
  fetched: Discussion[],
): Discussion[] {
  const fetchedIds = new Set(fetched.map((discussion) => discussion.id))
  const pending =
    queryClient.getQueryData<Discussion[]>(
      pendingDiscussionsQueryKey(targetKey),
    ) ?? []
  const unresolved = pending.filter(
    (discussion) => !fetchedIds.has(discussion.id),
  )

  queryClient.setQueryData(pendingDiscussionsQueryKey(targetKey), unresolved)
  return unresolved.reduce(upsertDiscussion, fetched)
}
