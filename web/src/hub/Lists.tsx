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
              Could not load merge requests ({summary.error}).{' '}
              <a href="#/settings">
                Reconnect {summary.host ?? summary.hostId}
              </a>
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
