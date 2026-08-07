import browser from 'webextension-polyfill'

import { ApiError } from '../api/client'
import type { DeltaResponse, HubOp } from '../extension/messages'
import type { MergeRequestPage } from '../gitlab/mergeRequests'

export interface HostSummary {
  hostId: string
  host?: string
  reviewing?: MergeRequestPage
  authored?: MergeRequestPage
  error?: string
}

export async function hubRequest<T>(
  op: HubOp,
  payload?: unknown,
): Promise<T> {
  const response = (await browser.runtime.sendMessage({
    kind: 'delta/hub',
    op,
    payload,
  })) as DeltaResponse
  if (!response.ok) {
    throw new ApiError(
      response.error.status,
      response.error.message,
      response.error.code,
    )
  }
  return response.data as T
}
