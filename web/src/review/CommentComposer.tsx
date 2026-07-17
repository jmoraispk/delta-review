import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'

import { api } from '../api/client'
import type { Discussion, PostingResult } from '../api/types'
import type { BackendSelection } from './selection'

interface CommentComposerProps {
  selection: BackendSelection
  onPosted?: (result: PostingResult) => void
  onCancel?: () => void
}

function selectedRange(selection: BackendSelection): string {
  const start = selection.start_new ?? selection.start_old
  const end = selection.end_new ?? selection.end_old
  return start === end ? `line ${start}` : `lines ${start}–${end}`
}

export function CommentComposer({
  selection,
  onPosted,
  onCancel,
}: CommentComposerProps) {
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState('')
  const createComment = useMutation({
    mutationFn: (body: string) =>
      api<PostingResult>('/api/discussions', {
        method: 'POST',
        body: JSON.stringify({ ...selection, body }),
      }),
    onSuccess: (result) => {
      setDraft('')
      queryClient.setQueryData<Discussion[]>(
        ['discussions'],
        (values = []) => {
          const index = values.findIndex(
            (value) => value.id === result.discussion.id,
          )
          if (index < 0) return [...values, result.discussion]
          return values.map((value, current) =>
            current === index ? result.discussion : value,
          )
        },
      )
      onPosted?.(result)
    },
  })

  function submit(event: FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (body && !createComment.isPending) createComment.mutate(body)
  }

  return (
    <form className="comment-composer" onSubmit={submit}>
      <div className="composer-heading">
        <div>
          <span className="eyebrow">New comment</span>
          <strong>
            {selection.new_path} · {selectedRange(selection)}
          </strong>
        </div>
        {onCancel ? (
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
      </div>
      <label>
        <span>Comment</span>
        <textarea
          aria-label="Comment"
          autoFocus
          maxLength={1_000_000}
          placeholder="Leave a specific, actionable note…"
          rows={4}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
      </label>
      <div className="composer-footer">
        <span>Markdown is supported by GitLab</span>
        <button
          className="primary-action"
          type="submit"
          disabled={!draft.trim() || createComment.isPending}
        >
          {createComment.isPending ? 'Posting…' : 'Comment'}
        </button>
      </div>
      {createComment.error ? (
        <p className="mutation-error" role="alert">
          {createComment.error.message}
        </p>
      ) : null}
    </form>
  )
}
