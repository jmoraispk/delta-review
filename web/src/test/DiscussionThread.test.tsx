import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { beforeEach, expect, test } from 'vitest'

import type { Discussion } from '../api/types'
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

test('labels a general fallback', async () => {
  server.use(
    http.post('/api/discussions', () =>
      HttpResponse.json(
        {
          placement: 'general',
          discussion: { id: 'fallback', notes: [] },
        },
        { status: 201 },
      ),
    ),
  )
  const user = userEvent.setup()
  render(<CommentComposer selection={selection} />, {
    wrapper: TestProviders,
  })

  await user.type(
    screen.getByLabelText('Comment'),
    'Please rename this.',
  )
  await user.click(screen.getByRole('button', { name: 'Comment' }))
  expect(
    await screen.findByText(/posted as a general discussion/i),
  ).toBeVisible()
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
