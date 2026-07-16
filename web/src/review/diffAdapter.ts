import type { DiffFile } from '../api/types'

function languageFor(path: string): string | undefined {
  const extension = path.split('.').pop()?.toLowerCase()
  return {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    json: 'json',
    css: 'css',
    html: 'html',
    md: 'markdown',
    yml: 'yaml',
    yaml: 'yaml',
  }[extension ?? '']
}

export function synthesizeUnifiedDiff(file: DiffFile): string {
  const oldHeader = file.new_file ? '/dev/null' : `a/${file.old_path}`
  const newHeader = file.deleted_file ? '/dev/null' : `b/${file.new_path}`
  return [
    `diff --git a/${file.old_path} b/${file.new_path}`,
    `--- ${oldHeader}`,
    `+++ ${newHeader}`,
    file.diff,
  ].join('\n')
}

export function toDiffData(file: DiffFile) {
  const language = languageFor(file.new_path || file.old_path)
  return {
    oldFile: {
      fileName: file.old_path,
      fileLang: language,
      content: '',
    },
    newFile: {
      fileName: file.new_path,
      fileLang: language,
      content: '',
    },
    hunks: [synthesizeUnifiedDiff(file)],
  }
}
