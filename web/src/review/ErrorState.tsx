import { ApiError } from '../api/client'

interface ErrorStateProps {
  error: Error
  onRetry: () => void
}

function errorCopy(error: Error): {
  heading: string
  guidance: string
  mark: string
} {
  const status = error instanceof ApiError ? error.status : null
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
      guidance: 'Check your GitLab permissions and glab authentication.',
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
    guidance: 'Check the local server and GitLab connection, then retry.',
    mark: '!',
  }
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const copy = errorCopy(error)
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
