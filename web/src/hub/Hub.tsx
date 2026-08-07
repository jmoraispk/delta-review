import { useEffect, useState } from 'react'

import App from '../App'
import { TransportProvider } from '../transport/context'
import { createRuntimeTransport } from '../transport/runtime'
import { Lists } from './Lists'
import { parseRoute, type Route } from './route'
import { Settings } from './Settings'

function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() =>
    parseRoute(window.location.hash),
  )
  useEffect(() => {
    const update = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return route
}

export function Hub() {
  const route = useRoute()

  if (route.name === 'review') {
    return (
      <TransportProvider
        key={`${route.target.hostId}/${route.target.project}/${route.target.iid}`}
        transport={createRuntimeTransport(route.target)}
      >
        <App />
      </TransportProvider>
    )
  }

  return (
    <div className="hub">
      <header className="hub-header">
        <a href="#/">
          <strong>Delta</strong>
        </a>
        <nav>
          <a href="#/settings">Settings</a>
        </nav>
      </header>
      {route.name === 'settings' ? <Settings /> : <Lists />}
    </div>
  )
}
