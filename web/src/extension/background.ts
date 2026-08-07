import browser from 'webextension-polyfill'

browser.runtime.onInstalled.addListener(() => {
  console.info('Delta Review installed')
})
