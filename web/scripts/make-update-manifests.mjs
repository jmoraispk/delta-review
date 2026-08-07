import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const { version } = JSON.parse(
  readFileSync(resolve(root, 'src/extension/manifest.base.json'), 'utf-8'),
)
const { chromeExtensionId } = JSON.parse(
  readFileSync(resolve(root, 'src/extension/id.json'), 'utf-8'),
)
// Chrome extension ids are 32 characters drawn from a-p. Shipping the
// placeholder instead would still produce a green release: an updates.xml no
// browser can match, and an ExtensionSettings policy that fails Chrome's
// schema and is discarded without a word to the user.
if (!/^[a-p]{32}$/.test(chromeExtensionId)) {
  throw new Error(
    `web/src/extension/id.json holds "${chromeExtensionId}", which is not a ` +
      'Chrome extension id. Put the 32-character id (letters a-p only) that ' +
      'Chrome derives from the CRX signing key in CRX_PRIVATE_KEY there — ' +
      'load the packed CRX once and chrome://extensions shows it — and use ' +
      'the same id in docs/install/index.html.',
  )
}
const geckoId = JSON.parse(
  readFileSync(resolve(root, 'src/extension/manifest.firefox.json'), 'utf-8'),
).browser_specific_settings.gecko.id

const base = process.env.DELTA_DOWNLOAD_BASE
if (!base) throw new Error('DELTA_DOWNLOAD_BASE is required')

const out = resolve(root, 'dist-extension/updates')
mkdirSync(out, { recursive: true })

writeFileSync(
  resolve(out, 'updates.xml'),
  `<?xml version='1.0' encoding='UTF-8'?>
<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>
  <app appid='${chromeExtensionId}'>
    <updatecheck codebase='${base}/delta-review.crx' version='${version}' />
  </app>
</gupdate>
`,
)

writeFileSync(
  resolve(out, 'updates.json'),
  `${JSON.stringify(
    {
      addons: {
        [geckoId]: {
          updates: [
            {
              version,
              // Stable, version-free name. The workflow renames web-ext's
              // delta_review-<version>.xpi to this before uploading.
              update_link: `${base}/delta-review.xpi`,
            },
          ],
        },
      },
    },
    null,
    2,
  )}\n`,
)
