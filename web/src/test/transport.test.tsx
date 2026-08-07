import { renderHook } from '@testing-library/react'
import { beforeEach, expect, test } from 'vitest'

import { createHttpTransport } from '../transport/http'
import { TransportProvider, useTransport } from '../transport/context'

beforeEach(() => {
  window.location.hash = '#session=test-session'
})

test('the http transport reads the proxy config', async () => {
  const transport = createHttpTransport()
  await expect(transport.getConfig()).resolves.toMatchObject({
    project: 'platform/delta-review',
    mr_iid: 42,
  })
})

test('the http transport has a stable target key', () => {
  expect(createHttpTransport().targetKey).toBe('proxy')
})

test('useTransport returns the provided transport', () => {
  const transport = createHttpTransport()
  const { result } = renderHook(() => useTransport(), {
    wrapper: ({ children }) => (
      <TransportProvider transport={transport}>{children}</TransportProvider>
    ),
  })
  expect(result.current).toBe(transport)
})

test('useTransport throws outside a provider', () => {
  expect(() => renderHook(() => useTransport())).toThrow(
    /TransportProvider/,
  )
})
