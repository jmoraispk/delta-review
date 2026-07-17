import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

test('links to the merge request in GitLab', async () => {
  render(<App />, { wrapper: TestProviders })

  expect(
    await screen.findByRole('link', { name: 'Open in GitLab' }),
  ).toHaveAttribute(
    'href',
    'https://gitlab.example.com/platform/delta-review/-/merge_requests/42',
  )
  expect(screen.getByRole('link', { name: 'Open in GitLab' })).toHaveAttribute(
    'target',
    '_blank',
  )
})

test('updates all review data and retains the active file after reordering', async () => {
  const calls = { mr: 0, diffs: 0, discussions: 0 }
  const parser = {
    old_path: 'src/parser.py',
    new_path: 'src/parser.py',
    diff: '@@ -1 +1 @@\n-old\n+new',
    new_file: false,
    renamed_file: false,
    deleted_file: false,
    collapsed: false,
    too_large: false,
  }
  const other = {
    old_path: 'src/other.py',
    new_path: 'src/other.py',
    diff: '@@ -1 +1 @@\n-old-other\n+new-other',
    new_file: false,
    renamed_file: false,
    deleted_file: false,
    collapsed: false,
    too_large: false,
  }

  server.use(
    http.get('/api/mr', async () => {
      calls.mr += 1
      if (calls.mr > 1) await delay(10)
      return HttpResponse.json({
        iid: 42,
        title: 'Improve parser errors',
        web_url:
          'https://gitlab.example.com/platform/delta-review/-/merge_requests/42',
        state: 'opened',
        source_branch: 'parser-errors',
        target_branch: 'main',
      })
    }),
    http.get('/api/diffs', () => {
      calls.diffs += 1
      return HttpResponse.json(calls.diffs === 1 ? [parser, other] : [other, parser])
    }),
    http.get('/api/discussions', () => {
      calls.discussions += 1
      return HttpResponse.json([])
    }),
  )

  render(<App />, { wrapper: TestProviders })

  expect(
    await screen.findByRole(
      'region',
      { name: 'src/parser.py' },
      { timeout: 5_000 },
    ),
  ).toBeVisible()
  fireEvent.keyDown(
    screen.getByRole('button', { name: /src\/parser.py/ }),
    { key: 'ArrowDown' },
  )
  expect(
    await screen.findByRole(
      'region',
      { name: 'src/other.py' },
      { timeout: 5_000 },
    ),
  ).toBeVisible()
  expect(calls).toEqual({ mr: 1, diffs: 1, discussions: 1 })

  screen.getByRole('button', { name: 'Update' }).click()

  expect(
    await screen.findByRole('button', { name: 'Updating…' }),
  ).toBeDisabled()
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Update' })).toBeEnabled(),
  )
  expect(calls).toEqual({ mr: 2, diffs: 2, discussions: 2 })
  await waitFor(
    () =>
      expect(
        screen.getByRole('region', { name: 'src/other.py' }),
      ).toBeVisible(),
    { timeout: 5_000 },
  )
  expect(await screen.findByText('Review updated.')).toBeVisible()
})

test('keeps review data visible when an update is incomplete', async () => {
  let discussionCalls = 0
  server.use(
    http.get('/api/discussions', () => {
      discussionCalls += 1
      if (discussionCalls === 2) {
        return HttpResponse.json(
          { detail: 'Discussion service unavailable' },
          { status: 500 },
        )
      }
      return HttpResponse.json([])
    }),
  )

  render(<App />, { wrapper: TestProviders })

  expect(
    await screen.findByRole('region', { name: 'src/parser.py' }),
  ).toBeVisible()

  screen.getByRole('button', { name: 'Update' }).click()

  expect(
    await screen.findByText('Review could not be fully updated.'),
  ).toBeVisible()
  expect(
    screen.getByRole('region', { name: 'src/parser.py' }),
  ).toBeVisible()
})

test('keeps review data visible when a required-query update fails', async () => {
  let diffCalls = 0
  server.use(
    http.get('/api/diffs', () => {
      diffCalls += 1
      if (diffCalls === 2) {
        return HttpResponse.json(
          { detail: 'Diff service unavailable' },
          { status: 500 },
        )
      }
      return HttpResponse.json([
        {
          old_path: 'src/parser.py',
          new_path: 'src/parser.py',
          diff: '@@ -1 +1 @@\n-old\n+new',
          new_file: false,
          renamed_file: false,
          deleted_file: false,
          collapsed: false,
          too_large: false,
        },
      ])
    }),
  )

  render(<App />, { wrapper: TestProviders })

  expect(
    await screen.findByRole('region', { name: 'src/parser.py' }),
  ).toBeVisible()

  screen.getByRole('button', { name: 'Update' }).click()

  expect(
    await screen.findByText('Review could not be fully updated.'),
  ).toBeVisible()
  expect(
    screen.getByRole('region', { name: 'src/parser.py' }),
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
