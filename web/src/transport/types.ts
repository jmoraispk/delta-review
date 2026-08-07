import type {
  DeltaConfig,
  DiffFile,
  Discussion,
  DiscussionNote,
  MergeRequest,
  PostingResult,
} from '../api/types'
import type { BackendSelection } from '../review/selection'

export interface ReviewTarget {
  hostId: string
  project: string
  iid: number
}

export interface InlineCommentInput extends BackendSelection {
  body: string
}

export interface DeltaTransport {
  /** Stable identity of the merge request this transport is bound to. */
  readonly targetKey: string
  getConfig(): Promise<DeltaConfig>
  getMergeRequest(signal?: AbortSignal): Promise<MergeRequest>
  getDiffs(signal?: AbortSignal): Promise<DiffFile[]>
  getDiscussions(signal?: AbortSignal): Promise<Discussion[]>
  createDiscussion(input: InlineCommentInput): Promise<PostingResult>
  replyToDiscussion(
    discussionId: string,
    body: string,
  ): Promise<DiscussionNote>
  setResolved(discussionId: string, resolved: boolean): Promise<Discussion>
}
