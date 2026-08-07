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
  data: Record<string, unknown>
}

export function createFakeBrowser(): FakeBrowser {
  const data: Record<string, unknown> = {}
  const granted = new Set<string>()
  return {
    data,
    granted,
    storage: {
      local: {
        get: async (keys) => {
          if (keys == null) return { ...data }
          const list = typeof keys === 'string' ? [keys] : keys
          return Object.fromEntries(
            list.filter((key) => key in data).map((key) => [key, data[key]]),
          )
        },
        set: async (items) => {
          Object.assign(data, items)
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
        for (const origin of origins) granted.add(origin)
        return true
      },
    },
  }
}
