import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import browser from 'webextension-polyfill'

import type { HostConfig } from '../extension/hosts'
import { originFor } from '../extension/hosts'
import type {
  MergeRequestPage,
  MergeRequestSummary,
} from '../gitlab/mergeRequests'
import { hubRequest, type HostSummary } from './api'
import { parseMergeRequestUrl } from './mrUrl'
import { buildReviewHash } from './route'

/**
 * Human sentences for the codes the worker attaches to a single host, so the
 * page never shows a user a bare `gitlab_authentication_failed`. Wording
 * tracks `review/ErrorState.tsx`, which explains the same conditions once the
 * user is inside a review. `permission_missing` is absent on purpose — it has
 * its own branch below, with a button.
 */
const HOST_ERRORS: Record<string, string> = {
  host_not_configured:
    'Delta has no token stored for this host. Add it again in settings.',
  gitlab_authentication_failed:
    'GitLab rejected the credentials Delta holds for this host. Renew them in settings.',
  gitlab_access_denied:
    'This GitLab account is not allowed to list merge requests on this host.',
  gitlab_not_found:
    'GitLab did not recognise this host’s API address. Check the hostname in settings.',
  gitlab_rate_limited: 'GitLab is rate limiting Delta. Wait briefly, then retry.',
  gitlab_timeout: 'GitLab did not answer in time. Retry when it is responsive.',
  gitlab_unavailable: 'GitLab is unavailable. Retry when it recovers.',
}

function describeHostError(code: string): string {
  return HOST_ERRORS[code] ?? 'Delta could not load merge requests from this host.'
}

function MergeRequestRow({
  hostId,
  item,
}: {
  hostId: string
  item: MergeRequestSummary
}) {
  const target = {
    hostId,
    project: item.references.full.split('!')[0],
    iid: item.iid,
  }
  return (
    <li className="hub-row">
      <a href={buildReviewHash(target)}>
        <strong>{item.title}</strong>
        <span className="hub-row-meta">
          {item.references.full} · {item.author.name}
        </span>
      </a>
    </li>
  )
}

function Section({
  title,
  hostId,
  page,
}: {
  title: string
  hostId: string
  page: MergeRequestPage
}) {
  return (
    <section className="hub-section">
      <h3>{title}</h3>
      {page.items.length === 0 ? (
        <p className="hub-empty">Nothing here.</p>
      ) : (
        <ul className="hub-list">
          {page.items.map((item) => (
            <MergeRequestRow key={item.id} hostId={hostId} item={item} />
          ))}
        </ul>
      )}
      {page.truncated ? (
        <p className="hub-note">
          Showing the first 100. Open GitLab to see the rest.
        </p>
      ) : null}
    </section>
  )
}

function OpenByUrl({ hosts }: { hosts: HostConfig[] }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  function open() {
    const target = parseMergeRequestUrl(value.trim(), hosts)
    if (!target) {
      setError(
        'That is not a merge request URL for a GitLab host you have added.',
      )
      return
    }
    setError(null)
    window.location.hash = buildReviewHash(target)
  }

  return (
    <section className="hub-section">
      <h3>Open by URL</h3>
      <div className="hub-open">
        <input
          type="url"
          value={value}
          placeholder="https://gitlab.example.com/group/project/-/merge_requests/42"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') open()
          }}
        />
        <button type="button" onClick={open}>
          Open
        </button>
      </div>
      {error ? (
        <p className="hub-error">
          {error} <a href="#/settings">Add a GitLab host</a>
        </p>
      ) : null}
    </section>
  )
}

export function Lists() {
  const queryClient = useQueryClient()
  const hosts = useQuery({
    queryKey: ['hosts'],
    queryFn: () => hubRequest<HostConfig[]>('listHosts'),
  })
  const summaries = useQuery({
    queryKey: ['merge-requests'],
    queryFn: () => hubRequest<HostSummary[]>('listMergeRequests'),
    enabled: (hosts.data?.length ?? 0) > 0,
  })

  async function grant(host: string) {
    const granted = await browser.permissions.request({
      origins: [originFor(host)],
    })
    if (granted) {
      void queryClient.invalidateQueries({ queryKey: ['merge-requests'] })
    }
  }

  if (hosts.isLoading) return <p>Loading…</p>
  // A rejected `listHosts` leaves `hosts.data` undefined, which the check
  // below cannot tell apart from a genuinely empty list. Without this branch
  // first, a user with hosts configured lands on the setup card and is told to
  // add their first GitLab host — the one screen that is certainly wrong, on
  // the page they see first.
  if (hosts.isError) {
    return (
      <p className="hub-error" role="alert">
        Could not load your GitLab hosts. Delta’s background service did not
        answer, so this is not a sign that your hosts are gone; retry, and
        reload this page if it keeps failing.{' '}
        <button type="button" onClick={() => void hosts.refetch()}>
          Retry
        </button>
        <span className="hub-detail">{hosts.error.message}</span>
      </p>
    )
  }
  if (!hosts.data?.length) {
    return (
      <div className="hub-setup">
        <h2>Add a GitLab host to get started</h2>
        <p>
          Delta needs a personal access token with the <code>api</code> scope
          for each GitLab instance you review on.
        </p>
        <a className="hub-cta" href="#/settings">
          Open settings
        </a>
      </div>
    )
  }

  return (
    <>
      <OpenByUrl hosts={hosts.data} />
      {/*
        A rejected `listMergeRequests` is a different situation from the
        per-host errors below: the worker never got far enough to report on any
        host. Without this branch `summaries.data` stays undefined and the page
        renders the box above and nothing else — no message, no retry, no sign
        anything failed.
      */}
      {summaries.isLoading ? (
        <p className="hub-note" aria-live="polite">
          Loading merge requests…
        </p>
      ) : null}
      {summaries.isError ? (
        <p className="hub-error" role="alert">
          Could not load your merge requests. Delta’s background service did
          not answer; retry, and reload this page if it keeps failing.{' '}
          <button type="button" onClick={() => void summaries.refetch()}>
            Retry
          </button>
          <span className="hub-detail">{summaries.error.message}</span>
        </p>
      ) : null}
      {summaries.data?.map((summary) => (
        <div key={summary.hostId}>
          <h2>{summary.host ?? summary.hostId}</h2>
          {summary.error === 'permission_missing' ? (
            <p className="hub-error">
              Delta no longer has permission to reach{' '}
              {summary.host ?? summary.hostId}.{' '}
              <button type="button" onClick={() => grant(summary.host!)}>
                Grant access
              </button>
            </p>
          ) : summary.error ? (
            <p className="hub-error">
              {describeHostError(summary.error)}{' '}
              <a href="#/settings">
                Reconnect {summary.host ?? summary.hostId}
              </a>
              <span className="hub-detail">{summary.error}</span>
            </p>
          ) : (
            <>
              <Section
                title="Awaiting your review"
                hostId={summary.hostId}
                page={summary.reviewing!}
              />
              <Section
                title="Yours"
                hostId={summary.hostId}
                page={summary.authored!}
              />
            </>
          )}
        </div>
      ))}
    </>
  )
}
