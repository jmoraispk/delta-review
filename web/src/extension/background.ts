import browser from 'webextension-polyfill'

import type { DeltaMessage } from './messages'
import { handleMessage } from './router'

// Returning the promise is the cross-browser way to reply asynchronously with
// webextension-polyfill.
browser.runtime.onMessage.addListener((message: unknown) =>
  handleMessage(message as DeltaMessage),
)
