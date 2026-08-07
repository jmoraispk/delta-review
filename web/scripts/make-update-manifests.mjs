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
              update_link: `${base}/delta_review-${version}.xpi`,
            },
          ],
        },
      },
    },
    null,
    2,
  )}\n`,
)
