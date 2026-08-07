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
fake.runtime = {
  sendMessage: async (message) => {
    const { op } = message as { op: string }
    if (op === 'listHosts') return { ok: true, data: hosts }
    if (op === 'listMergeRequests') return { ok: true, data: summaries }
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
  fake.reset()
})

test('with no hosts it shows the setup card, not empty lists', async () => {
  renderHub()
  expect(await screen.findByText(/Add a GitLab host/i)).toBeInTheDocument()
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
