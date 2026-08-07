import { expect, test } from 'vitest'

import type { DiffFile } from '../api/types'
import {
  ancestorPaths,
  buildFileTree,
  flattenTree,
} from '../review/fileTreeModel'

function file(path: string): DiffFile {
  return {
    old_path: path,
    new_path: path,
    diff: '@@ -1 +1 @@\n-a\n+b',
    new_file: false,
    renamed_file: false,
    deleted_file: false,
    collapsed: false,
    too_large: false,
  }
}

const NOTHING_COLLAPSED = new Set<string>()

test('groups files under their directories', () => {
  const rows = flattenTree(
    buildFileTree([file('src/a.py'), file('src/b.py')]),
    NOTHING_COLLAPSED,
  )

  expect(rows.map((row) => [row.kind, row.name, row.depth])).toEqual([
    ['dir', 'src', 0],
    ['file', 'a.py', 1],
    ['file', 'b.py', 1],
  ])
})

test('compresses single-child directory chains into one row', () => {
  const rows = flattenTree(
    buildFileTree([file('notebooks/torch/pusch/tin3.py')]),
    NOTHING_COLLAPSED,
  )

  expect(rows.map((row) => [row.kind, row.name])).toEqual([
    ['dir', 'notebooks/torch/pusch'],
    ['file', 'tin3.py'],
  ])
})

test('stops compressing where a directory branches', () => {
  const rows = flattenTree(
    buildFileTree([file('src/py6g/pusch/a.py'), file('src/py6g/_np/b.py')]),
    NOTHING_COLLAPSED,
  )

  expect(rows.map((row) => [row.kind, row.name, row.depth])).toEqual([
    ['dir', 'src/py6g', 0],
    ['dir', '_np', 1],
    ['file', 'b.py', 2],
    ['dir', 'pusch', 1],
    ['file', 'a.py', 2],
  ])
})

test('lists directories before files at the same level', () => {
  const rows = flattenTree(
    buildFileTree([file('mkdocs.yml'), file('src/a.py')]),
    NOTHING_COLLAPSED,
  )

  expect(rows.map((row) => [row.kind, row.name])).toEqual([
    ['dir', 'src'],
    ['file', 'a.py'],
    ['file', 'mkdocs.yml'],
  ])
})

test('keeps the original file index so selection still works', () => {
  const rows = flattenTree(
    buildFileTree([file('z/last.py'), file('a/first.py')]),
    NOTHING_COLLAPSED,
  )
  const fileRows = rows.flatMap((row) =>
    row.kind === 'file' ? [[row.name, row.fileIndex]] : [],
  )

  expect(fileRows).toEqual([
    ['first.py', 1],
    ['last.py', 0],
  ])
})

test('hides descendants of a collapsed directory', () => {
  const tree = buildFileTree([file('src/a.py'), file('docs/b.md')])
  const rows = flattenTree(tree, new Set(['src']))

  expect(rows.map((row) => [row.kind, row.name])).toEqual([
    ['dir', 'docs'],
    ['file', 'b.md'],
    ['dir', 'src'],
  ])
})

test('reports the ancestors that must be open to reveal a path', () => {
  expect(ancestorPaths('src/py6g/pusch')).toEqual([
    'src',
    'src/py6g',
    'src/py6g/pusch',
  ])
  expect(ancestorPaths('')).toEqual([])
})
