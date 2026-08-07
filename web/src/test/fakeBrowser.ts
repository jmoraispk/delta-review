/**
 * In-memory stand-in for the `browser.*` API from `webextension-polyfill`.
 *
 * Required usage pattern — the order matters:
 *
 * ```ts
 * const fake = createFakeBrowser()
 * vi.mock('webextension-polyfill', () => ({ default: fake }))
 *
 * const { saveHost } = await import('./hosts')
 * ```
 *
 * The dynamic `await import(...)` is not optional. `vi.mock` is hoisted to the
 * top of the test file, but a *static* `import` of the module under test is
 * hoisted too and would bind the real `webextension-polyfill` before the mock
 * is installed. Importing dynamically defers that binding until after the mock
 * is registered.
 *
 * For the same reason, the `vi.mock` call must appear literally in the test
 * file. It cannot be wrapped in a helper here: Vitest hoists the call
 * lexically, so a `vi.mock` inside a function in this module gets lifted out of
 * that function to the top of this file, where the function's parameters do not
 * exist — which throws for every test file that merely imports from here.
 *
 * `storage.local` structured-clones on write and on read, mirroring the real
 * API. Values handed back by `get` are therefore detached copies, so mutating
 * one cannot silently write through to storage and disguise a missing `set`.
 */

export interface FakeBrowser {
  storage: {
    local: {
      get: (keys?: string | string[] | null) => Promise<Record<string, unknown>>
      set: (items: Record<string, unknown>) => Promise<void>
      remove: (keys: string | string[]) => Promise<void>
    }
  }
  permissions: {
    contains: (value: { origins: string[] }) => Promise<boolean>
    request: (value: { origins: string[] }) => Promise<boolean>
  }
  granted: Set<string>
  /** When true, `permissions.request` resolves false and grants nothing. */
  denyRequests: boolean
  data: Record<string, unknown>
  /** Clears all stored state. Call from `beforeEach`. */
  reset: () => void
}

export function createFakeBrowser(): FakeBrowser {
  const data: Record<string, unknown> = {}
  const granted = new Set<string>()
  const fake: FakeBrowser = {
    data,
    granted,
    denyRequests: false,
    reset: () => {
      for (const key of Object.keys(data)) delete data[key]
      granted.clear()
      fake.denyRequests = false
    },
    storage: {
      local: {
        get: async (keys) => {
          if (keys == null) return structuredClone(data)
          const list = typeof keys === 'string' ? [keys] : keys
          return Object.fromEntries(
            list
              .filter((key) => key in data)
              .map((key) => [key, structuredClone(data[key])]),
          )
        },
        set: async (items) => {
          Object.assign(data, structuredClone(items))
        },
        remove: async (keys) => {
          for (const key of typeof keys === 'string' ? [keys] : keys) {
            delete data[key]
          }
        },
      },
    },
    permissions: {
      contains: async ({ origins }) =>
        origins.every((origin) => granted.has(origin)),
      request: async ({ origins }) => {
        if (fake.denyRequests) return false
        for (const origin of origins) granted.add(origin)
        return true
      },
    },
  }
  return fake
}
