import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'

import { api, ApiError } from '../api/client'
import { ErrorState } from '../review/ErrorState'
import { server } from './server'

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
  render(
    <ErrorState
      error={new ApiError(status, 'request failed', code)}
      onRetry={() => undefined}
    />,
  )

  expect(screen.getByRole('heading', { name: heading })).toBeVisible()
})

test('surfaces the unknown outcome of a write the transport refused to retry', () => {
  render(
    <ErrorState
      error={
        new ApiError(
          503,
          'Delta lost contact with its background service. Your comment may ' +
            'or may not have been posted; reload to check before retrying.',
          'extension_unavailable',
        )
      }
      onRetry={() => undefined}
    />,
  )

  // In the guidance paragraph, not buried in the collapsed technical detail.
  expect(screen.getByRole('alert').querySelector('p')).toHaveTextContent(
    /may or may not have been posted/i,
  )
})

test('offers a working retry action', async () => {
  const retry = vi.fn()
  const user = userEvent.setup()
  render(
    <ErrorState
      error={new ApiError(429, 'slow down')}
      onRetry={retry}
    />,
  )

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
