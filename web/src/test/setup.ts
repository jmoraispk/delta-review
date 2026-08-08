import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

import { server } from './server'

Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value: vi.fn(() => ({
    font: '',
    measureText: (text: string) => ({ width: text.length * 7 }),
  })),
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverStub)

// `__DELTA_DEV__` only exists as a build-time define (web/scripts/build-extension.mjs),
// so under vitest the bare identifier is undeclared and reading it throws a
// ReferenceError. Default it to what a release build sees; the one test that
// cares about the development branch stubs it true for itself.
vi.stubGlobal('__DELTA_DEV__', false)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
  sessionStorage.clear()
  window.location.hash = ''
})
afterAll(() => server.close())
