import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, test } from 'vitest'

import type { Discussion, PostingResult } from '../api/types'
import { api } from '../api/client'
import { CommentComposer } from '../review/CommentComposer'
import { DiscussionThread } from '../review/DiscussionThread'
import type { BackendSelection } from '../review/selection'
import { TestProviders } from './fixtures'
import { server } from './server'

const discussion: Discussion = {
  id: 'discussion-1',
  notes: [
    {
      id: 1,
      body: 'Could this name be clearer?',
      author: { name: 'Ada Lovelace', username: 'ada' },
      resolvable: true,
      resolved: false,
      position: {
        old_path: 'src/parser.py',
        new_path: 'src/parser.py',
        old_line: null,
        new_line: 12,
      },
    },
  ],
}

const selection: BackendSelection = {
  old_path: 'src/parser.py',
  new_path: 'src/parser.py',
  start_old: null,
  start_new: 12,
  end_old: null,
  end_new: 12,
}

beforeEach(() => {
  window.location.hash = '#session=test-session'
})

function DiscussionCacheObserver() {
  useQuery({
    queryKey: ['discussions'],
    queryFn: async () => {
      const response = await fetch('/api/discussions')
      return response.json() as Promise<Discussion[]>
    },
    staleTime: Infinity,
  })
  return null
}

function DelayedDiscussionCacheObserver() {
  useQuery({
    queryKey: ['discussions'],
    queryFn: ({ signal }) =>
      api<Discussion[]>('/api/discussions', { signal }),
  })
  return null
}

test('replies and resolves a discussion', async () => {
  server.use(
    http.post('/api/discussions/discussion-1/notes', async ({ request }) => {
      const body = (await request.json()) as { body: string }
      return HttpResponse.json(
        {
          id: 2,
          body: body.body,
          author: { name: 'You', username: 'you' },
        },
        { status: 201 },
      )
    }),
    http.put('/api/discussions/discussion-1', () =>
      HttpResponse.json({ ...discussion, resolved: true }),
    ),
  )
  const user = userEvent.setup()
  render(<DiscussionThread discussion={discussion} />, {
    wrapper: TestProviders,
  })

  await user.type(screen.getByLabelText('Reply'), 'Fixed now.')
  await user.click(screen.getByRole('button', { name: 'Reply' }))
  expect(await screen.findByText('Fixed now.')).toBeVisible()

  await user.click(screen.getByRole('button', { name: 'Resolve' }))
  expect(await screen.findByText('Resolved')).toBeVisible()
})

test('renders GitLab-flavored Markdown without exposing HTML comments', () => {
  render(
    <DiscussionThread
      discussion={{
        ...discussion,
        notes: [
          {
            ...discussion.notes[0],
            body: [
              '<!-- internal metadata -->',
              '**Important change**',
              '',
              '| File | Change |',
              '| --- | --- |',
              '| parser.py | Handles errors |',
            ].join('\n'),
          },
        ],
      }}
    />,
    { wrapper: TestProviders },
  )

  expect(screen.getByText('Important change').tagName).toBe('STRONG')
  expect(screen.getByRole('table')).toBeVisible()
  expect(screen.queryByText(/internal metadata/)).not.toBeInTheDocument()
})

test('renders a reviewer mark for every automated note', () => {
  render(
    <DiscussionThread
      discussion={{
        ...discussion,
        notes: [
          {
            ...discussion.notes[0],
            author: { name: 'CodeRabbit', username: 'opaque-coderabbit' },
          },
          {
            id: 2,
            body: 'Please also update the test.',
            author: { name: 'Greptile', username: 'opaque-greptile' },
          },
        ],
      }}
    />,
    { wrapper: TestProviders },
  )

  expect(screen.getByAltText('CodeRabbit')).toBeVisible()
  expect(screen.getByAltText('Greptile')).toBeVisible()
  expect(screen.getByText('Greptile')).toBeVisible()
})

test('keeps the POSTed discussion in the cache without refetching', async () => {
  const existing: Discussion = { id: 'existing', notes: [] }
  const posted: Discussion = { id: 'posted', notes: [] }
  let discussionGetCount = 0
  server.use(
    http.get('/api/discussions', () => {
      discussionGetCount += 1
      return HttpResponse.json([])
    }),
    http.post('/api/discussions', () =>
      HttpResponse.json(
        {
          placement: 'inline',
          fallback: 'none',
          discussion: posted,
        },
        { status: 201 },
      ),
    ),
  )
  const user = userEvent.setup()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData<Discussion[]>(['discussions'], [existing])
  render(
    <QueryClientProvider client={queryClient}>
      <DiscussionCacheObserver />
      <CommentComposer selection={selection} />
    </QueryClientProvider>,
  )

  await user.type(
    screen.getByLabelText('Comment'),
    'Please rename this.',
  )
  await user.click(screen.getByRole('button', { name: 'Comment' }))
  await waitFor(() =>
    expect(queryClient.getQueryData<Discussion[]>(['discussions'])).toEqual([
      existing,
      posted,
    ]),
  )

  expect(discussionGetCount).toBe(0)
})

test('replaces an equal-ID discussion with the authoritative POST result', async () => {
  const stale: Discussion = { id: 'discussion-1', notes: [] }
  const posted: Discussion = {
    id: 'discussion-1',
    notes: [{ id: 2, body: 'Fresh result' }],
  }
  server.use(
    http.post('/api/discussions', () =>
      HttpResponse.json(
        {
          placement: 'inline',
          fallback: 'none',
          discussion: posted,
        } satisfies PostingResult,
        { status: 201 },
      ),
    ),
  )
  const user = userEvent.setup()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  queryClient.setQueryData<Discussion[]>(['discussions'], [stale])
  render(
    <QueryClientProvider client={queryClient}>
      <CommentComposer selection={selection} />
    </QueryClientProvider>,
  )

  await user.type(screen.getByLabelText('Comment'), 'Fresh result')
  await user.click(screen.getByRole('button', { name: 'Comment' }))

  await waitFor(() =>
    expect(queryClient.getQueryData<Discussion[]>(['discussions'])).toEqual([
      posted,
    ]),
  )
})

test('keeps the POSTed discussion when a startup fetch resolves afterward', async () => {
  const posted: Discussion = { id: 'posted', notes: [] }
  let startGet!: () => void
  let resolveGet!: (value: Discussion[]) => void
  const getStarted = new Promise<void>((resolve) => {
    startGet = resolve
  })
  const delayedGet = new Promise<Discussion[]>((resolve) => {
    resolveGet = resolve
  })
  server.use(
    http.get('/api/discussions', async () => {
      startGet()
      return HttpResponse.json(await delayedGet)
    }),
    http.post('/api/discussions', () =>
      HttpResponse.json(
        {
          placement: 'inline',
          fallback: 'none',
          discussion: posted,
        } satisfies PostingResult,
        { status: 201 },
      ),
    ),
  )
  const user = userEvent.setup()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={queryClient}>
      <DelayedDiscussionCacheObserver />
      <CommentComposer selection={selection} />
    </QueryClientProvider>,
  )

  await getStarted
  await user.type(screen.getByLabelText('Comment'), 'Keep this comment.')
  await user.click(screen.getByRole('button', { name: 'Comment' }))
  await waitFor(() =>
    expect(queryClient.getQueryData<Discussion[]>(['discussions'])).toEqual([
      posted,
    ]),
  )

  resolveGet([])
  await new Promise((resolve) => window.setTimeout(resolve, 25))
  expect(queryClient.getQueryData<Discussion[]>(['discussions'])).toEqual([
    posted,
  ])
})

test('keeps the comment draft when posting fails', async () => {
  server.use(
    http.post('/api/discussions', () =>
      HttpResponse.json(
        { detail: 'GitLab rejected the comment' },
        { status: 502 },
      ),
    ),
  )
  const user = userEvent.setup()
  render(<CommentComposer selection={selection} />, {
    wrapper: TestProviders,
  })

  const editor = screen.getByLabelText('Comment')
  await user.type(editor, 'Do not lose this draft.')
  await user.click(screen.getByRole('button', { name: 'Comment' }))

  expect(await screen.findByRole('alert')).toBeVisible()
  expect(editor).toHaveValue('Do not lose this draft.')
})
