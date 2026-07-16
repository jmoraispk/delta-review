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
  data: DiffData
  theme: 'light' | 'dark'
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage: (message: {
    bundle: ReturnType<DiffFile['_getFullBundle']>
  }) => void
}

const workerScope = self as unknown as WorkerScope

workerScope.onmessage = ({ data: request }) => {
  const diffFile = DiffFile.createInstance(request.data)
  diffFile.initTheme(request.theme)
  diffFile.initRaw()
  diffFile.buildSplitDiffLines()
  diffFile.buildUnifiedDiffLines()
  workerScope.postMessage({ bundle: diffFile._getFullBundle() })
}
