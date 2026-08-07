import { QueryClient } from '@tanstack/react-query'
import { expect, test } from 'vitest'

import {
  discussionsQueryKey,
  mergeFetchedDiscussions,
  recordPostedDiscussion,
} from '../review/discussionCache'

const discussion = { id: 'abc', notes: [] }

test('keys for different targets do not collide', () => {
  expect(discussionsQueryKey('a')).not.toEqual(discussionsQueryKey('b'))
})

test('a posted discussion is not visible under another target', () => {
  const client = new QueryClient()
  recordPostedDiscussion(client, 'a', discussion)
  expect(mergeFetchedDiscussions(client, 'b', [])).toEqual([])
  expect(mergeFetchedDiscussions(client, 'a', [])).toEqual([discussion])
})
