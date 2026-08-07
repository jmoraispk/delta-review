import { api } from '../api/client'
import type {
  DeltaConfig,
  DiffFile,
  Discussion,
  DiscussionNote,
  MergeRequest,
  PostingResult,
} from '../api/types'
import type { DeltaTransport } from './types'

export function createHttpTransport(): DeltaTransport {
  return {
    targetKey: 'proxy',
    getConfig: () => api<DeltaConfig>('/api/config'),
    getMergeRequest: (signal) => api<MergeRequest>('/api/mr', { signal }),
    getDiffs: (signal) => api<DiffFile[]>('/api/diffs', { signal }),
    getDiscussions: (signal) =>
      api<Discussion[]>('/api/discussions', { signal }),
    createDiscussion: (input) =>
      api<PostingResult>('/api/discussions', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    replyToDiscussion: (discussionId, body) =>
      api<DiscussionNote>(
        `/api/discussions/${encodeURIComponent(discussionId)}/notes`,
        { method: 'POST', body: JSON.stringify({ body }) },
      ),
    setResolved: (discussionId, resolved) =>
      api<Discussion>(
        `/api/discussions/${encodeURIComponent(discussionId)}`,
        { method: 'PUT', body: JSON.stringify({ resolved }) },
      ),
  }
}
