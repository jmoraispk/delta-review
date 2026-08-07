import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'

import { createFakeBrowser } from '../test/fakeBrowser'

const fake = createFakeBrowser() as ReturnType<typeof createFakeBrowser> & {
  runtime: { sendMessage: (message: unknown) => Promise<unknown> }
}
let hosts: unknown[] = []
let summaries: unknown[] = []
/** Overridable so a test can make `listMergeRequests` fail or hang. */
let replyToListMergeRequests = async (): Promise<unknown> => ({
  ok: true,
  data: summaries,
})
/** Same, for the query the whole page is gated on. */
let replyToListHosts = async (): Promise<unknown> => ({ ok: true, data: hosts })
fake.runtime = {
  sendMessage: async (message) => {
    const { op } = message as { op: string }
    if (op === 'listHosts') return replyToListHosts()
    if (op === 'listMergeRequests') return replyToListMergeRequests()
    return { ok: true, data: null }
  },
}
vi.mock('webextension-polyfill', () => ({ default: fake }))

const { Hub } = await import('./Hub')

function renderHub() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <Hub />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.location.hash = ''
  hosts = []
  summaries = []
  replyToListMergeRequests = async () => ({ ok: true, data: summaries })
  replyToListHosts = async () => ({ ok: true, data: hosts })
  fake.reset()
})

const ONE_HOST = [
  { id: 'h', host: 'gitlab.example.com', userId: 7, username: 'j' },
]

test('with no hosts it shows the setup card, not empty lists', async () => {
  renderHub()
  expect(await screen.findByText(/Add a GitLab host/i)).toBeInTheDocument()
})

test('a failed host load says so instead of claiming there are no hosts', async () => {
  const user = userEvent.setup()
  hosts = ONE_HOST
  replyToListHosts = async () => ({
    ok: false,
    error: {
      code: 'delta_internal_error',
      message: 'Storage read failed',
      status: 500,
    },
  })
  renderHub()

  expect(
    await screen.findByText(/Could not load your GitLab hosts/i),
  ).toBeInTheDocument()
  expect(screen.getByText('Storage read failed')).toBeInTheDocument()
  // The setup card would tell a configured user to start from scratch.
  expect(screen.queryByText(/Add a GitLab host to get started/i)).toBeNull()

  replyToListHosts = async () => ({ ok: true, data: hosts })
  await user.click(screen.getByRole('button', { name: 'Retry' }))

  expect(await screen.findByText('Open by URL')).toBeInTheDocument()
  expect(screen.queryByText(/Could not load your GitLab hosts/i)).toBeNull()
})

test('lists merge requests awaiting review', async () => {
  hosts = [{ id: 'h', host: 'gitlab.example.com', userId: 7, username: 'j' }]
  summaries = [
    {
      hostId: 'h',
      host: 'gitlab.example.com',
      reviewing: {
        items: [
          {
            id: 1,
            iid: 42,
            title: 'Improve parser errors',
            web_url: 'https://gitlab.example.com/g/p/-/merge_requests/42',
            project_id: 1,
            references: { full: 'g/p!42' },
            updated_at: '2026-08-01T10:00:00Z',
            author: { id: 3, username: 'ana', name: 'Ana' },
          },
        ],
        truncated: false,
      },
      authored: { items: [], truncated: false },
    },
  ]
  renderHub()
  expect(await screen.findByText('Improve parser errors')).toBeInTheDocument()
})

test('a truncated list says so', async () => {
  hosts = [{ id: 'h', host: 'gitlab.example.com', userId: 7, username: 'j' }]
  summaries = [
    {
      hostId: 'h',
      host: 'gitlab.example.com',
      reviewing: { items: [], truncated: true },
      authored: { items: [], truncated: false },
    },
  ]
  renderHub()
  expect(await screen.findByText(/showing the first 100/i)).toBeInTheDocument()
})

test('a revoked permission offers to grant it again', async () => {
  hosts = [{ id: 'h', host: 'gitlab.example.com', userId: 7, username: 'j' }]
  summaries = [
    { hostId: 'h', host: 'gitlab.example.com', error: 'permission_missing' },
  ]
  renderHub()
  expect(
    await screen.findByRole('button', { name: /Grant access/i }),
  ).toBeInTheDocument()
})

test('a host that fails to load is reported without hiding the others', async () => {
  hosts = [{ id: 'h', host: 'gitlab.example.com', userId: 7, username: 'j' }]
  summaries = [
    {
      hostId: 'h',
      host: 'gitlab.example.com',
      error: 'gitlab_authentication_failed',
    },
  ]
  renderHub()
  expect(await screen.findByText(/Reconnect gitlab.example.com/i)).toBeInTheDocument()
})

test('a per-host failure reads as a sentence, not a machine code', async () => {
  hosts = ONE_HOST
  summaries = [
    {
      hostId: 'h',
      host: 'gitlab.example.com',
      error: 'gitlab_authentication_failed',
    },
  ]
  renderHub()

  expect(
    await screen.findByText(/GitLab rejected the credentials Delta holds/i),
  ).toBeInTheDocument()
  // The raw code stays available, but not as the sentence the user reads.
  expect(
    screen.getByText('gitlab_authentication_failed'),
  ).toHaveClass('hub-detail')
})

test('a rejected merge request load explains itself and retries', async () => {
  const user = userEvent.setup()
  hosts = ONE_HOST
  summaries = [
    {
      hostId: 'h',
      host: 'gitlab.example.com',
      reviewing: {
        items: [
          {
            id: 1,
            iid: 42,
            title: 'Improve parser errors',
            web_url: 'https://gitlab.example.com/g/p/-/merge_requests/42',
            project_id: 1,
            references: { full: 'g/p!42' },
            updated_at: '2026-08-01T10:00:00Z',
            author: { id: 3, username: 'ana', name: 'Ana' },
          },
        ],
        truncated: false,
      },
      authored: { items: [], truncated: false },
    },
  ]
  replyToListMergeRequests = async () => ({
    ok: false,
    error: { code: 'delta_internal_error', message: 'Storage read failed', status: 500 },
  })
  renderHub()

  expect(
    await screen.findByText(/Could not load your merge requests/i),
  ).toBeInTheDocument()
  expect(screen.getByText('Storage read failed')).toBeInTheDocument()

  replyToListMergeRequests = async () => ({ ok: true, data: summaries })
  await user.click(screen.getByRole('button', { name: 'Retry' }))

  expect(await screen.findByText('Improve parser errors')).toBeInTheDocument()
  expect(
    screen.queryByText(/Could not load your merge requests/i),
  ).not.toBeInTheDocument()
})

test('the page says it is loading rather than flashing empty', async () => {
  hosts = ONE_HOST
  replyToListMergeRequests = () => new Promise<unknown>(() => {})
  renderHub()

  expect(
    await screen.findByText(/Loading merge requests/i),
  ).toBeInTheDocument()
})

test('settings offers to re-grant a host whose permission was withdrawn', async () => {
  const user = userEvent.setup()
  hosts = [{ id: 'h', host: 'gitlab.example.com', userId: 7, username: 'j' }]
  window.location.hash = '#/settings'
  renderHub()

  await user.click(await screen.findByRole('button', { name: 'Grant access' }))

  expect(fake.granted.has('https://gitlab.example.com/*')).toBe(true)
})

test('settings refuses a hostname that carries a port', async () => {
  const user = userEvent.setup()
  window.location.hash = '#/settings'
  renderHub()

  await user.type(
    await screen.findByLabelText(/Hostname/i),
    'https://gitlab.example.com:8443/',
  )
  await user.type(await screen.findByLabelText(/token/i), 'glpat-secret')
  await user.click(screen.getByRole('button', { name: 'Add host' }))

  expect(await screen.findByText(/without a port/i)).toBeInTheDocument()
  expect(await screen.findByText(/gitlab\.example\.com/)).toBeInTheDocument()
  expect(fake.granted.size).toBe(0)
})
