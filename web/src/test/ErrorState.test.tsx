import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { expect, test, vi } from 'vitest'

import { api, ApiError } from '../api/client'
import { ErrorState } from '../review/ErrorState'
import { server } from './server'

test.each([
  [401, 'Session expired'],
  [403, 'Access denied'],
  [404, 'Merge request not found'],
  [429, 'GitLab rate limit reached'],
  [503, 'GitLab is unavailable'],
])('explains HTTP %s failures', (status, heading) => {
  render(
    <ErrorState
      error={new ApiError(status, 'request failed')}
      onRetry={() => undefined}
    />,
  )

  expect(screen.getByRole('heading', { name: heading })).toBeVisible()
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
