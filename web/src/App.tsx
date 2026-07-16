import { useQuery } from '@tanstack/react-query'

import { api } from './api/client'
import type {
  DeltaConfig,
  DiffFile,
  Discussion,
  MergeRequest,
} from './api/types'

function fileStatus(file: DiffFile): string | null {
  if (file.new_file) return 'new'
  if (file.deleted_file) return 'deleted'
  if (file.renamed_file) return 'renamed'
  return null
}

export function App() {
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

  const activeFile = diffs.data[0]
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
          <nav>
            {diffs.data.map((file, index) => {
              const status = fileStatus(file)
              return (
                <button
                  className={`file-row ${index === 0 ? 'is-active' : ''}`}
                  type="button"
                  key={`${file.old_path}:${file.new_path}`}
                >
                  <span className="file-glyph" aria-hidden="true">
                    {index === 0 ? '◆' : '◇'}
                  </span>
                  <span className="file-path">{file.new_path}</span>
                  {status ? <span className="file-status">{status}</span> : null}
                </button>
              )
            })}
          </nav>
        </aside>

        <main className="review-main">
          <section className="merge-request-heading">
            <div className="heading-copy">
              <span className="eyebrow">
                {mergeRequest.data.state} · {mergeRequest.data.source_branch}
                <span aria-hidden="true"> → </span>
                {mergeRequest.data.target_branch}
              </span>
              <h1>{mergeRequest.data.title}</h1>
            </div>
            <div className="view-control" aria-label="Diff view">
              <button className="is-selected" type="button">
                Unified
              </button>
              <button type="button">Split</button>
            </div>
          </section>

          {activeFile ? (
            <section className="diff-stage" aria-label={activeFile.new_path}>
              <header className="diff-header">
                <div>
                  <span className="language-dot" aria-hidden="true" />
                  <strong>{activeFile.new_path}</strong>
                </div>
                <span>Ready for diff rendering</span>
              </header>
              <div className="diff-placeholder" aria-hidden="true">
                <span className="line-number">41</span>
                <code>const review = await delta.open()</code>
                <span className="line-number">42</span>
                <code className="removed">- waitForGitLab()</code>
                <span className="line-number">43</span>
                <code className="added">+ reviewNow()</code>
              </div>
            </section>
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
