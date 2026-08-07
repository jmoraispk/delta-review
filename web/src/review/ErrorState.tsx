import { ApiError } from '../api/client'
import { useTransport } from '../transport/context'

interface ErrorStateProps {
  error: Error
  onRetry: () => void
}

/**
 * The same screen serves two products that hold GitLab credentials in
 * different places. Under `uvx delta-review` (`targetKey === 'proxy'`) the
 * token belongs to `glab` and Delta never sees one, so telling that user to
 * renew Delta's credentials points them at something their install does not
 * have. In the extension the opposite is true: `glab` need not be installed
 * at all. Anything that names a credential holder has to say which.
 */
function errorCopy(
  error: Error,
  isProxy: boolean,
): {
  heading: string
  guidance: string
  mark: string
} {
  const status = error instanceof ApiError ? error.status : null
  const code = error instanceof ApiError ? error.code : null
  if (code === 'gitlab_authentication_failed') {
    return {
      heading: 'GitLab authentication failed',
      guidance: isProxy
        ? 'GitLab rejected the credentials glab holds for this host. Run ' +
          'glab auth login for it, then retry.'
        : 'GitLab rejected the credentials Delta holds for this host. Renew ' +
          'them in Delta settings, then retry.',
      mark: '401',
    }
  }
  if (code === 'permission_missing') {
    return {
      heading: 'Delta lost access to this GitLab host',
      guidance:
        'The browser permission for this host was withdrawn. Grant it again ' +
        'from Delta settings, then retry.',
      mark: '403',
    }
  }
  if (code === 'extension_unavailable') {
    // The transport words this one per operation: a read that ran out of
    // retries and a write it deliberately refused to retry need different
    // advice, and the write's "may or may not have been posted" is the whole
    // point. Show that message rather than a generic line that hides it.
    return {
      heading: 'Delta background service unavailable',
      guidance: error.message,
      mark: '503',
    }
  }
  if (code === 'diff_truncated') {
    return {
      heading: 'Diff is incomplete',
      guidance: 'GitLab truncated this merge request diff. Open it in GitLab.',
      mark: '422',
    }
  }
  if (code === 'gitlab_timeout') {
    return {
      heading: 'GitLab request timed out',
      guidance: 'Check the GitLab connection, then retry.',
      mark: '504',
    }
  }
  if (status === 401) {
    return {
      heading: 'Session expired',
      guidance: 'Relaunch Delta from the CLI to create a new local session.',
      mark: '401',
    }
  }
  if (status === 403) {
    return {
      heading: 'Access denied',
      guidance: isProxy
        ? 'This GitLab account cannot see this merge request. Check your ' +
          'project access, and which account glab is signed in as, then retry.'
        : 'This GitLab account cannot see this merge request. Check your ' +
          'project access, then retry.',
      mark: '403',
    }
  }
  if (status === 404) {
    return {
      heading: 'Merge request not found',
      guidance: 'Confirm the project and merge request still exist.',
      mark: '404',
    }
  }
  if (status === 429) {
    return {
      heading: 'GitLab rate limit reached',
      guidance: 'Wait briefly, then retry the request.',
      mark: '429',
    }
  }
  if (status !== null && status >= 500) {
    return {
      heading: 'GitLab is unavailable',
      guidance: 'The upstream service failed. Retry when GitLab recovers.',
      mark: String(status),
    }
  }
  return {
    heading: 'Review could not be loaded',
    guidance: 'Check that Delta and GitLab are both reachable, then retry.',
    mark: '!',
  }
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const transport = useTransport()
  const copy = errorCopy(error, transport.targetKey === 'proxy')
  return (
    <main className="state-screen error-state" role="alert">
      <div className="state-mark error-code" aria-hidden="true">
        {copy.mark}
      </div>
      <h1>{copy.heading}</h1>
      <p>{copy.guidance}</p>
      <details>
        <summary>Technical detail</summary>
        <code>{error.message}</code>
      </details>
      <button type="button" onClick={onRetry}>
        Retry
      </button>
    </main>
  )
}
