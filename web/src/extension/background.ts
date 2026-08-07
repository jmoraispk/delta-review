import browser from 'webextension-polyfill'

import { forgetHubTab, openHub } from './action'
import type { DeltaMessage } from './messages'
import { handleMessage } from './router'

// Returning the promise is the cross-browser way to reply asynchronously with
// webextension-polyfill.
browser.runtime.onMessage.addListener((message: unknown) =>
  handleMessage(message as DeltaMessage),
)

browser.action.onClicked.addListener((tab) => {
  void openHub(tab.url)
})

// A remembered tab id only means anything within the session that issued it.
// Both events start a session whose ids bear no relation to the stored one.
browser.runtime.onStartup.addListener(() => {
  void forgetHubTab()
})
browser.runtime.onInstalled.addListener(() => {
  void forgetHubTab()
})
