import { createContext, useContext, type ReactNode } from 'react'

import type { DeltaTransport } from './types'

const TransportContext = createContext<DeltaTransport | null>(null)

export function TransportProvider({
  transport,
  children,
}: {
  transport: DeltaTransport
  children: ReactNode
}) {
  return (
    <TransportContext.Provider value={transport}>
      {children}
    </TransportContext.Provider>
  )
}

export function useTransport(): DeltaTransport {
  const transport = useContext(TransportContext)
  if (!transport) {
    throw new Error('useTransport requires a TransportProvider ancestor')
  }
  return transport
}
