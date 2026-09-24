import { expect, test } from 'vitest'

import { devDefine } from './build-extension.mjs'

test('a release build defines the dev flag as false', () => {
  expect(devDefine([])).toEqual({ __DELTA_DEV__: 'false' })
})

test('--dev turns the flag on', () => {
  expect(devDefine(['--dev'])).toEqual({ __DELTA_DEV__: 'true' })
})

test('an unrelated flag does not turn it on', () => {
  expect(devDefine(['--watch'])).toEqual({ __DELTA_DEV__: 'false' })
})
