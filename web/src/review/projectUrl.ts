const MERGE_REQUEST_MARKER = '/-/merge_requests/'

/**
 * The project page for a merge request, taken from its own web URL so the
 * host and protocol always match the instance the review came from.
 */
export function projectUrlFrom(mergeRequestUrl: string): string | null {
  const marker = mergeRequestUrl.indexOf(MERGE_REQUEST_MARKER)
  return marker > 0 ? mergeRequestUrl.slice(0, marker) : null
}
