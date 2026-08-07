import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'

import { api, ApiError } from '../api/client'
import { ErrorState } from '../review/ErrorState'
import { TransportProvider } from '../transport/context'
import { createHttpTransport } from '../transport/http'
import { server } from './server'

/**
 * `proxy` is the Python deployment; any other key is an extension review of
 * one merge request. Only `targetKey` decides the wording, so overriding it on
 * the HTTP transport is enough to render either product's copy.
 */
function renderErrorState(
  error: Error,
  { onRetry = () => undefined, targetKey = 'proxy' } = {},
) {
  return render(
    <TransportProvider transport={{ ...createHttpTransport(), targetKey }}>
      <ErrorState error={error} onRetry={onRetry} />
    </TransportProvider>,
  )
}

function guidance(): HTMLElement {
  return screen.getByRole('alert').querySelector('p')!
}

test.each([
  [401, undefined, 'Session expired'],
  [401, 'gitlab_authentication_failed', 'GitLab authentication failed'],
  [403, undefined, 'Access denied'],
  [404, undefined, 'Merge request not found'],
  [403, 'permission_missing', 'Delta lost access to this GitLab host'],
  [422, 'diff_truncated', 'Diff is incomplete'],
  [429, undefined, 'GitLab rate limit reached'],
  [503, undefined, 'GitLab is unavailable'],
  [503, 'extension_unavailable', 'Delta background service unavailable'],
])('explains HTTP %s failures', (status, code, heading) => {
  renderErrorState(new ApiError(status, 'request failed', code))

  expect(screen.getByRole('heading', { name: heading })).toBeVisible()
})

test('tells a CLI user to renew the credentials glab holds, not Delta', () => {
  renderErrorState(
    new ApiError(401, 'unauthorized', 'gitlab_authentication_failed'),
    { targetKey: 'proxy' },
  )

  // Delta holds no GitLab credentials under `uvx delta-review`: glab does.
  expect(guidance()).toHaveTextContent(/credentials glab holds/i)
  expect(guidance()).toHaveTextContent(/glab auth login/i)
  expect(guidance()).not.toHaveTextContent(/Delta holds/i)
})

test('tells an extension user to renew the credentials Delta holds', () => {
  renderErrorState(
    new ApiError(401, 'unauthorized', 'gitlab_authentication_failed'),
    { targetKey: 'h/group/project/42' },
  )

  // The extension stores its own token and never requires glab.
  expect(guidance()).toHaveTextContent(/credentials Delta holds/i)
  expect(guidance()).toHaveTextContent(/Delta settings/i)
  expect(guidance()).not.toHaveTextContent(/glab/i)
})

test('only mentions glab access on the deployment that uses it', () => {
  const cli = renderErrorState(new ApiError(403, 'forbidden'), {
    targetKey: 'proxy',
  })
  expect(guidance()).toHaveTextContent(/glab is signed in as/i)
  cli.unmount()

  renderErrorState(new ApiError(403, 'forbidden'), { targetKey: 'h/g/p/42' })
  expect(guidance()).not.toHaveTextContent(/glab/i)
})

test('surfaces the unknown outcome of a write the transport refused to retry', () => {
  renderErrorState(
    new ApiError(
      503,
      'Delta lost contact with its background service. Your comment may ' +
        'or may not have been posted; reload to check before retrying.',
      'extension_unavailable',
    ),
  )

  // In the guidance paragraph, not buried in the collapsed technical detail.
  expect(guidance()).toHaveTextContent(/may or may not have been posted/i)
})

test('offers a working retry action', async () => {
  const retry = vi.fn()
  const user = userEvent.setup()
  renderErrorState(new ApiError(429, 'slow down'), { onRetry: retry })

  await user.click(screen.getByRole('button', { name: 'Retry' }))

  expect(retry).toHaveBeenCalledOnce()
})

test('preserves HTTP status and server guidance in API errors', async () => {
  window.location.hash = '#session=test-session'
  server.use(
    http.get('/api/failure', () =>
      HttpResponse.json(
        { code: 'denied', message: 'GitLab says no' },
        { status: 403 },
      ),
    ),
  )

  await expect(api('/api/failure')).rejects.toMatchObject({
    status: 403,
    code: 'denied',
    message: 'GitLab says no',
  })
})
