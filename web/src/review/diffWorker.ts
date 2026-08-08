import { DiffFile } from '@git-diff-view/core'

interface DiffData {
  oldFile?: {
    fileName?: string | null
    fileLang?: string | null
    content?: string | null
  }
  newFile?: {
    fileName?: string | null
    fileLang?: string | null
    content?: string | null
  }
  hunks: string[]
}

interface WorkerRequest {
  id: number
  data: DiffData
  theme: 'light' | 'dark'
  mode: 'unified' | 'split'
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (message: {
    id: number
    bundle: ReturnType<DiffFile['_getFullBundle']>
  }) => void
}

const workerScope = self as unknown as WorkerScope

workerScope.onmessage = ({ data: request }) => {
  const diffFile = DiffFile.createInstance(request.data)
  diffFile.initTheme(request.theme)
  diffFile.initRaw()
  // Syntax tokens off the main thread when this build has a highlighter;
  // otherwise the viewer highlights after mount as before.
  try {
    diffFile.initSyntax()
  } catch {
    // No highlighter registered in this worker; render unhighlighted.
  }
  // Build only what is on screen; the other mode is a separate cache key.
  if (request.mode === 'split') diffFile.buildSplitDiffLines()
  else diffFile.buildUnifiedDiffLines()
  workerScope.postMessage({
    id: request.id,
    bundle: diffFile._getFullBundle(),
  })
}
