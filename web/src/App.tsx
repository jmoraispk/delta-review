import { useQuery } from '@tanstack/react-query'
import { lazy, Suspense, useRef, useState } from 'react'

import { api } from './api/client'
import type {
  DeltaConfig,
  DiffFile,
  Discussion,
  MergeRequest,
} from './api/types'
import { FileTree } from './review/FileTree'

const DiffViewer = lazy(() =>
  import('./review/DiffViewer').then((module) => ({
    default: module.DiffViewer,
  })),
)

export function App() {
  const [requestedFileIndex, setRequestedFileIndex] = useState(0)
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
  })

  const queries = [config, mergeRequest, diffs, discussions]
  const error = queries.find((query) => query.error)?.error
  const isPending = queries.some((query) => query.isPending)

  if (error) {
    return (
      <main className="state-screen">
        <div className="state-mark" aria-hidden="true">
          !
        </div>
        <h1>Review could not be loaded</h1>
        <p>{error.message}</p>
        <button
          type="button"
          onClick={() => {
            void Promise.all(queries.map((query) => query.refetch()))
          }}
        >
          Retry
        </button>
      </main>
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
          </section>

          {activeFile ? (
            <Suspense
              fallback={
                <section className="diff-stage diff-loading">
                  Preparing diff…
                </section>
              }
            >
              <DiffViewer file={activeFile} />
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
