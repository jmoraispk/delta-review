import { useMutation, useQueryClient } from '@tanstack/react-query'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useEffect, useState, type FormEvent } from 'react'

import { api } from '../api/client'
import type { Discussion, DiscussionNote } from '../api/types'

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeRaw, rehypeSanitize]

interface DiscussionThreadProps {
  discussion: Discussion
}

function updateCachedDiscussion(
  discussions: Discussion[] | undefined,
  discussionId: string,
  update: (discussion: Discussion) => Discussion,
): Discussion[] | undefined {
  return discussions?.map((discussion) =>
    discussion.id === discussionId ? update(discussion) : discussion,
  )
}

export function DiscussionThread({
  discussion,
}: DiscussionThreadProps) {
  const queryClient = useQueryClient()
  const [current, setCurrent] = useState(discussion)
  const [draft, setDraft] = useState('')

  useEffect(() => setCurrent(discussion), [discussion])

  const reply = useMutation({
    mutationFn: (body: string) =>
      api<DiscussionNote>(
        `/api/discussions/${encodeURIComponent(current.id)}/notes`,
        {
          method: 'POST',
          body: JSON.stringify({ body }),
        },
      ),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: ['discussions'] })
      const snapshot = queryClient.getQueryData<Discussion[]>([
        'discussions',
      ])
      const previous = current
      const optimisticNote: DiscussionNote = {
        id: `optimistic-${Date.now()}`,
        body,
        author: { name: 'You', username: 'you' },
      }
      const update = (value: Discussion): Discussion => ({
        ...value,
        notes: [...value.notes, optimisticNote],
      })
      setCurrent(update)
      queryClient.setQueryData<Discussion[]>(['discussions'], (values) =>
        updateCachedDiscussion(values, current.id, update),
      )
      return { snapshot, previous, optimisticId: optimisticNote.id }
    },
    onError: (_error, _body, context) => {
      if (context) {
        setCurrent(context.previous)
        queryClient.setQueryData(['discussions'], context.snapshot)
      }
    },
    onSuccess: (note, _body, context) => {
      const replaceOptimistic = (value: Discussion): Discussion => ({
        ...value,
        notes: value.notes.map((existing) =>
          existing.id === context.optimisticId ? note : existing,
        ),
      })
      setCurrent(replaceOptimistic)
      queryClient.setQueryData<Discussion[]>(['discussions'], (values) =>
        updateCachedDiscussion(values, current.id, replaceOptimistic),
      )
      setDraft('')
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['discussions'] }),
  })

  const resolvableNote = current.notes.find((note) => note.resolvable)
  const isResolved = Boolean(resolvableNote?.resolved)
  const resolution = useMutation({
    mutationFn: (resolved: boolean) =>
      api<Discussion>(
        `/api/discussions/${encodeURIComponent(current.id)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ resolved }),
        },
      ),
    onMutate: async (resolved) => {
      await queryClient.cancelQueries({ queryKey: ['discussions'] })
      const snapshot = queryClient.getQueryData<Discussion[]>([
        'discussions',
      ])
      const previous = current
      const update = (value: Discussion): Discussion => ({
        ...value,
        notes: value.notes.map((note) =>
          note.resolvable ? { ...note, resolved } : note,
        ),
      })
      setCurrent(update)
      queryClient.setQueryData<Discussion[]>(['discussions'], (values) =>
        updateCachedDiscussion(values, current.id, update),
      )
      return { snapshot, previous }
    },
    onError: (_error, _resolved, context) => {
      if (context) {
        setCurrent(context.previous)
        queryClient.setQueryData(['discussions'], context.snapshot)
      }
    },
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: ['discussions'] }),
  })

  function submitReply(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (body && !reply.isPending) reply.mutate(body)
  }

  return (
    <article
      className="discussion-thread"
      data-discussion-id={current.id}
      tabIndex={-1}
    >
      <header className="thread-heading">
        <span className="thread-author">
          {current.notes[0]?.author?.name ?? 'GitLab reviewer'}
        </span>
        {resolvableNote ? (
          <span
            className={`resolution-state ${isResolved ? 'is-resolved' : ''}`}
          >
            {isResolved ? 'Resolved' : 'Open'}
          </span>
        ) : null}
      </header>

      <div className="thread-notes">
        {current.notes.map((note) => (
          <div className="thread-note" key={note.id}>
            <span className="author-initial" aria-hidden="true">
              {(note.author?.name ?? '?').slice(0, 1).toUpperCase()}
            </span>
            <div>
              {note !== current.notes[0] ? (
                <strong>{note.author?.name ?? 'Reviewer'}</strong>
              ) : null}
              <div className="note-markdown">
                <ReactMarkdown
                  remarkPlugins={remarkPlugins}
                  rehypePlugins={rehypePlugins}
                >
                  {note.body}
                </ReactMarkdown>
              </div>
            </div>
          </div>
        ))}
      </div>

      <form className="reply-form" onSubmit={submitReply}>
        <label>
          <span>Reply</span>
          <textarea
            aria-label="Reply"
            maxLength={1_000_000}
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <div className="thread-actions">
          {resolvableNote ? (
            <button
              type="button"
              disabled={resolution.isPending}
              onClick={() => resolution.mutate(!isResolved)}
            >
              {isResolved ? 'Unresolve' : 'Resolve'}
            </button>
          ) : null}
          <button
            className="primary-action"
            type="submit"
            disabled={!draft.trim() || reply.isPending}
          >
            Reply
          </button>
        </div>
      </form>
      {reply.error || resolution.error ? (
        <p className="mutation-error" role="alert">
          {(reply.error ?? resolution.error)?.message}
        </p>
      ) : null}
    </article>
  )
}
