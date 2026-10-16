import test from 'node:test'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { generateKeyPairSync } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { main } from './play-deploy.mjs'
import { contrastIn } from './device-qa.mjs'

// Importing either helper must be safe without adb or release credentials.
test('image helper imports without device discovery', () => {
  assert.equal(contrastIn({ width: 1, height: 1, channels: 3, data: Buffer.alloc(3) }, [0, 0, 1, 1]), null)
})

for (const status of ['draft', 'completed', 'dry-run']) {
  test(`publishing reports only verified outcomes: ${status}`, async () => {
    const original = { argv: process.argv, fetch: globalThis.fetch, log: console.log,
      key: process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON, summary: process.env.GITHUB_STEP_SUMMARY }
    const logs = [], requests = []
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON = JSON.stringify({
      client_email: 'test@example.invalid', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    })
    delete process.env.GITHUB_STEP_SUMMARY
    process.argv = ['node', 'play-deploy.mjs', ...(status === 'dry-run' ? ['--dry-run'] :
      ['--aab', fileURLToPath(import.meta.url), '--status', status])]
    console.log = (...args) => logs.push(args.join(' '))
    globalThis.fetch = async (url, options = {}) => {
      requests.push({ url, ...options })
      if (String(url).includes('oauth2')) return Response.json({ access_token: 'fake-token' })
      if (String(url).includes('uploadType=resumable')) return new Response('', { headers: { location: 'https://upload.invalid/test' } })
      if (String(url).includes('upload.invalid')) return Response.json({ versionCode: 7 })
      return Response.json({ id: 'test-edit' })
    }
    try {
      await main()
      const output = logs.join(' ')
      assert.doesNotMatch(output, /is live|permissions are all good/)
      if (status === 'dry-run') {
        assert.match(output, /Upload and track permissions were not tested/)
        assert.equal(requests.some(r => String(r.url).includes(':commit')), false)
        assert.equal(requests.some(r => String(r.url).includes('upload')), false)
      } else {
        assert.match(output, new RegExp(`status ${status}`))
        assert.match(output, /availability is not verified/)
        const track = requests.find(r => String(r.url).includes('/tracks/'))
        assert.equal(JSON.parse(track.body).releases[0].status, status)
      }
    } finally {
      process.argv = original.argv; globalThis.fetch = original.fetch; console.log = original.log
      for (const [key, value] of [['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', original.key], ['GITHUB_STEP_SUMMARY', original.summary]]) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value
      }
    }
  })
}

test('release workflow requires main, validation, enable switch and environment', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/android-play.yml', import.meta.url), 'utf8')
  assert.doesNotMatch(workflow, /^  push:/m)
  assert.match(workflow, /needs: validate/)
  assert.match(workflow, /environment: android-production/)
  assert.equal((workflow.match(/github.ref == 'refs\/heads\/main'/g) || []).length, 2)
  assert.equal((workflow.match(/vars.ANDROID_PLAY_ENABLED == 'true'/g) || []).length, 2)
})
