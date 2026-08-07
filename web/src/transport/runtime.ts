import browser from 'webextension-polyfill'

import { ApiError } from '../api/client'
import type {
  DeltaConfig,
  DiffFile,
  Discussion,
  DiscussionNote,
  MergeRequest,
  PostingResult,
} from '../api/types'
import type { DeltaResponse, ReviewOp } from '../extension/messages'
import type { DeltaTransport, InlineCommentInput, ReviewTarget } from './types'

/** Chrome and Firefox phrase a torn-down worker differently. */
const PORT_CLOSED = /message port closed|Receiving end does not exist/i

async function sendOnce(
  op: ReviewOp,
  target: ReviewTarget,
  payload?: unknown,
): Promise<DeltaResponse> {
  return (await browser.runtime.sendMessage({
    kind: 'delta/review',
    op,
    target,
    payload,
  })) as DeltaResponse
}

async function send<T>(
  op: ReviewOp,
  target: ReviewTarget,
  payload?: unknown,
): Promise<T> {
  let response: DeltaResponse
  try {
    response = await sendOnce(op, target, payload)
  } catch (error) {
    if (!PORT_CLOSED.test(String(error))) throw error
    try {
      response = await sendOnce(op, target, payload)
    } catch (retryError) {
      throw new ApiError(
        503,
        'The Delta background service is not responding. Reload the page.',
        'extension_unavailable',
      )
    }
  }
  if (!response.ok) {
    throw new ApiError(
      response.error.status,
      response.error.message,
      response.error.code,
    )
  }
  return response.data as T
}

export function createRuntimeTransport(target: ReviewTarget): DeltaTransport {
  return {
    targetKey: `${target.hostId}/${target.project}/${target.iid}`,
    getConfig: () => send<DeltaConfig>('getConfig', target),
    getMergeRequest: () => send<MergeRequest>('getMergeRequest', target),
    getDiffs: () => send<DiffFile[]>('getDiffs', target),
    getDiscussions: () => send<Discussion[]>('getDiscussions', target),
    createDiscussion: (input: InlineCommentInput) =>
      send<PostingResult>('createDiscussion', target, input),
    replyToDiscussion: (discussionId, body) =>
      send<DiscussionNote>('replyToDiscussion', target, {
        discussionId,
        body,
      }),
    setResolved: (discussionId, resolved) =>
      send<Discussion>('setResolved', target, { discussionId, resolved }),
  }
}
