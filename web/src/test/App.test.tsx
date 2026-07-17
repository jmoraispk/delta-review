import { render, screen } from '@testing-library/react'
import { delay, http, HttpResponse } from 'msw'
import { beforeEach, expect, test } from 'vitest'

import App from '../App'
import { TestProviders } from './fixtures'
import { server } from './server'

beforeEach(() => {
  window.location.hash = '#session=test-session'
})

test('renders merge request identity and files', async () => {
  render(<App />, { wrapper: TestProviders })

  expect(await screen.findByText('Improve parser errors')).toBeVisible()
  expect((await screen.findAllByText('src/parser.py'))[0]).toBeVisible()
  expect(screen.getByText('gitlab.example.com')).toBeVisible()
  expect(
    screen.getByLabelText('Total changes: 1 addition, 1 deletion'),
  ).toBeVisible()
})

test('renders code without waiting for discussions', async () => {
  server.use(
    http.get('/api/discussions', async () => {
      await delay('infinite')
      return HttpResponse.json([])
    }),
  )

  render(<App />, { wrapper: TestProviders })

  expect(await screen.findByText('Improve parser errors')).toBeVisible()
  expect(
    await screen.findByRole(
      'region',
      { name: 'src/parser.py' },
      { timeout: 5_000 },
    ),
  ).toBeVisible()
})

test('keeps general MR discussions outside file views', async () => {
  server.use(
    http.get('/api/discussions', () =>
      HttpResponse.json([
        {
          id: 'general',
          notes: [{ id: 1, body: '**General review note**' }],
        },
      ]),
    ),
  )

  render(<App />, { wrapper: TestProviders })

  expect(
    await screen.findByRole('region', { name: 'src/parser.py' }),
  ).toBeVisible()
  expect(screen.queryByText('General review note')).not.toBeInTheDocument()

  screen.getByRole('button', { name: 'MR discussions (1)' }).click()

  expect(await screen.findByText('General review note')).toBeVisible()
})

test('keeps code visible when discussions fail and offers retry', async () => {
  server.use(
    http.get('/api/discussions', () =>
      HttpResponse.json(
        { detail: 'Discussion service unavailable' },
        { status: 500 },
      ),
    ),
  )

  render(<App />, { wrapper: TestProviders })

  expect(
    await screen.findByRole('region', { name: 'src/parser.py' }),
  ).toBeVisible()
  expect(
    await screen.findByRole('button', {
      name: 'Retry loading discussions',
    }),
  ).toBeVisible()
})
