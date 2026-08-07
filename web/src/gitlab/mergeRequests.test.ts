import { http, HttpResponse } from 'msw'
import { expect, test } from 'vitest'

import { server } from '../test/server'
import { GitLabClient } from './client'
import { listAuthored, listReviewRequested } from './mergeRequests'
import { getCurrentUser } from './user'

// The msw server lifecycle (listen/resetHandlers/close) is owned by
// src/test/setup.ts. Standing up a second setupServer() here would make every
// request resolver run twice.
const BASE = 'https://gitlab.example.com/api/v4'
const client = () => new GitLabClient(BASE, 'token')

function summary(iid: number) {
  return {
    id: iid,
    iid,
    title: `MR ${iid}`,
    web_url: `https://gitlab.example.com/p/-/merge_requests/${iid}`,
    project_id: 1,
    references: { full: `group/project!${iid}` },
    updated_at: '2026-08-01T10:00:00Z',
    author: { id: 3, username: 'ana', name: 'Ana' },
  }
}

test('resolves the current user', async () => {
  server.use(
    http.get(`${BASE}/user`, () =>
      HttpResponse.json({ id: 7, username: 'joao', name: 'Joao' }),
    ),
  )
  await expect(getCurrentUser(client())).resolves.toMatchObject({
    id: 7,
    username: 'joao',
  })
})

test('filters review-requested merge requests by reviewer', async () => {
  let query = ''
  server.use(
    http.get(`${BASE}/merge_requests`, ({ request }) => {
      query = new URL(request.url).search
      return HttpResponse.json([summary(1)])
    }),
  )
  const page = await listReviewRequested(client(), 7)
  expect(page.items).toHaveLength(1)
  expect(page.truncated).toBe(false)
  expect(query).toContain('reviewer_id=7')
  expect(query).toContain('state=opened')
  expect(query).toContain('scope=all')
})

test('filters authored merge requests by author', async () => {
  let query = ''
  server.use(
    http.get(`${BASE}/merge_requests`, ({ request }) => {
      query = new URL(request.url).search
      return HttpResponse.json([])
    }),
  )
  await listAuthored(client(), 7)
  expect(query).toContain('author_id=7')
})

test('reports truncation when the page is full', async () => {
  server.use(
    http.get(`${BASE}/merge_requests`, () =>
      HttpResponse.json(
        Array.from({ length: 100 }, (_value, index) => summary(index + 1)),
      ),
    ),
  )
  await expect(listAuthored(client(), 7)).resolves.toMatchObject({
    truncated: true,
  })
})
