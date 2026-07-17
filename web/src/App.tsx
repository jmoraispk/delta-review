import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useMemo, useRef, useState } from 'react'

import { api } from './api/client'
import type {
  DeltaConfig,
  DiffFile,
  Discussion,
  MergeRequest,
} from './api/types'
import { ErrorState } from './review/ErrorState'
import { FileTree } from './review/FileTree'
import { diffStats, diffStatsLabel } from './review/diffStats'

const DiffViewer = lazy(() =>
  import('./review/DiffViewer').then((module) => ({
    default: module.DiffViewer,
  })),
)
const GeneralDiscussionsPanel = lazy(() =>
  import('./review/GeneralDiscussionsPanel').then((module) => ({
    default: module.GeneralDiscussionsPanel,
  })),
)

export function App() {
  const [requestedFileIndex, setRequestedFileIndex] = useState(0)
  const [showGeneralDiscussions, setShowGeneralDiscussions] =
    useState(false)
  const diffFocusRef = useRef<HTMLElement>(null)
  const config = useQuery({
    queryKey: ['config'],
    queryFn: () => api<DeltaConfig>('/api/config'),
    staleTime: 30_000,
  })
  const mergeRequest = useQuery({
    queryKey: ['merge-request'],
    queryFn: () => api<MergeRequest>('/api/mr'),
    staleTime: 30_000,
  })
  const diffs = useQuery({
    queryKey: ['diffs'],
    queryFn: () => api<DiffFile[]>('/api/diffs'),
    staleTime: 30_000,
  })
  const discussions = useQuery({
    queryKey: ['discussions'],
    queryFn: () => api<Discussion[]>('/api/discussions'),
    retry: false,
  })
  const totalChanges = useMemo(
    () =>
      (diffs.data ?? []).reduce(
        (total, file) => {
          const stats = diffStats(file.diff)
          total.additions += stats.additions
          total.deletions += stats.deletions
          return total
        },
        { additions: 0, deletions: 0 },
      ),
    [diffs.data],
  )
  const generalDiscussions = useMemo(
    () =>
      (discussions.data ?? []).filter((discussion) =>
        discussion.notes.every((note) => !note.position),
      ),
    [discussions.data],
  )

  const requiredQueries = [config, mergeRequest, diffs]
  const error = requiredQueries.find((query) => query.error)?.error
  const isPending = requiredQueries.some((query) => query.isPending)

  if (error) {
    return (
      <ErrorState
        error={error}
        onRetry={() => {
            void Promise.all(
              requiredQueries.map((query) => query.refetch()),
            )
        }}
      />
    )
  }

  if (isPending || !config.data || !mergeRequest.data || !diffs.data) {
    return (
      <main className="state-screen" aria-live="polite">
        <div className="delta-loader" aria-hidden="true" />
        <p>Loading merge request…</p>
      </main>
    )
  }

  const activeFileIndex = Math.min(
    requestedFileIndex,
    Math.max(0, diffs.data.length - 1),
  )
  const activeFile = diffs.data[activeFileIndex]
  const threadCount = discussions.data?.length ?? 0

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href={mergeRequest.data.web_url}>
          <span className="brand-mark" aria-hidden="true" />
          <span>delta</span>
        </a>
        <div className="repository-context">
          <span>{config.data.project}</span>
          <span className="separator" aria-hidden="true">
            /
          </span>
          <strong>!{mergeRequest.data.iid}</strong>
        </div>
        <div className="topbar-meta">
          <span className="connection-dot" aria-hidden="true" />
          <span>{config.data.host}</span>
        </div>
      </header>

      <div className="review-workspace">
        <aside className="file-rail" aria-label="Changed files">
          <div className="rail-heading">
            <div>
              <span className="eyebrow">Changes</span>
              <strong>{diffs.data.length} files</strong>
              <span
                className="rail-diff-stats"
                aria-label={`Total changes: ${diffStatsLabel(totalChanges)}`}
              >
                <span className="stat-addition" aria-hidden="true">
                  +{totalChanges.additions}
                </span>
                <span className="stat-deletion" aria-hidden="true">
                  −{totalChanges.deletions}
                </span>
              </span>
            </div>
            <span className="thread-count" title="Discussion count">
              {threadCount}
            </span>
          </div>
          <FileTree
            files={diffs.data}
            activeIndex={activeFileIndex}
            onSelect={setRequestedFileIndex}
            onFocusDiff={() => diffFocusRef.current?.focus()}
          />
        </aside>

        <main className="review-main" ref={diffFocusRef} tabIndex={-1}>
          <section className="merge-request-heading">
            <div className="heading-copy">
              <span className="eyebrow">
                {mergeRequest.data.state} · {mergeRequest.data.source_branch}
                <span aria-hidden="true"> → </span>
                {mergeRequest.data.target_branch}
              </span>
              <h1>{mergeRequest.data.title}</h1>
            </div>
            <div className="heading-actions">
              {generalDiscussions.length > 0 ? (
                <button
                  className="mr-discussions-toggle"
                  aria-expanded={showGeneralDiscussions}
                  type="button"
                  onClick={() =>
                    setShowGeneralDiscussions((visible) => !visible)
                  }
                >
                  MR discussions ({generalDiscussions.length})
                </button>
              ) : null}
              {discussions.error ? (
                <button
                  className="discussion-load-error"
                  aria-label="Retry loading discussions"
                  type="button"
                  onClick={() => void discussions.refetch()}
                >
                  Comments unavailable · Retry
                </button>
              ) : null}
            </div>
          </section>

          {showGeneralDiscussions ? (
            <Suspense
              fallback={
                <section className="mr-discussions-panel">
                  Loading discussions…
                </section>
              }
            >
              <GeneralDiscussionsPanel
                discussions={generalDiscussions}
                onClose={() => setShowGeneralDiscussions(false)}
              />
            </Suspense>
          ) : null}

          {activeFile ? (
            <Suspense
              fallback={
                <section className="diff-stage diff-loading">
                  Preparing diff…
                </section>
              }
            >
              <DiffViewer
                key={`${activeFile.old_path}:${activeFile.new_path}`}
                file={activeFile}
                discussions={discussions.data ?? []}
              />
            </Suspense>
          ) : (
            <section className="empty-review">
              <h2>No changed files</h2>
              <p>This merge request does not contain a renderable diff.</p>
            </section>
          )}
        </main>
      </div>
    </div>
  )
}

export default App
