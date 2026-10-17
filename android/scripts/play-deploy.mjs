#!/usr/bin/env node
// Publishes a signed app bundle to a Google Play track.
//
// Dependency free on purpose: this repository ships one runtime dependency and a handful of plain
// .mjs scripts, and a release path is the worst place to take on a supply chain. Everything here is
// Node's own crypto and fetch against the Play Developer API v3.
//
// Credentials come from the environment, never from a file in the repository:
//
//   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON   the service account key, raw JSON or base64 of it
//
// Usage:
//   node scripts/play-deploy.mjs --aab <path> [--track internal] [--status completed]
//                                [--notes store/android/fastlane/metadata/android]
//                                [--package io.joao.worldclock] [--dry-run]
//
// --dry-run authenticates, opens an edit and deletes it again. It checks authentication, the package name
// and edit access only without changing anything a tester could see.

import { createSign } from 'node:crypto'
import { readFile, stat, readdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const API = 'https://androidpublisher.googleapis.com/androidpublisher/v3'
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3'
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher'

/**
 * Stops the run with a readable reason.
 *
 * Throws rather than calling process.exit. Exiting from inside a pending fetch tears the event loop
 * down under libuv and prints "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" after the
 * real message, with an exit code of 127 that looks like a missing binary rather than a refused
 * credential. Setting exitCode and unwinding lets Node close cleanly and report 1.
 */
class Stop extends Error {}

function fail (message) {
  console.error(`\n  Deployment stopped: ${message}\n`)
  process.exitCode = 1
  throw new Stop(message)
}

function parseArgs (argv) {
  const out = {
    track: 'internal',
    status: 'completed',
    package: 'io.joao.worldclock',
    notes: 'store/android/fastlane/metadata/android',
    dryRun: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const value = argv[++i]
      if (value === undefined) fail(`${arg} needs a value.`)
      return value
    }
    switch (arg) {
      case '--aab': out.aab = next(); break
      case '--track': out.track = next(); break
      case '--status': out.status = next(); break
      case '--package': out.package = next(); break
      case '--notes': out.notes = next(); break
      case '--dry-run': out.dryRun = true; break
      case '--print-next-version-code': out.printNextVersionCode = true; break
      case '--help': case '-h': console.log(HELP); process.exit(0); break
      default: fail(`Unknown argument ${arg}. Run with --help.`)
    }
  }
  return out
}

const HELP = `
Publish a signed .aab to a Google Play track.

  --aab <path>      the signed bundle (required unless --dry-run)
  --track <name>    internal (default), alpha, beta, production
  --status <state>  completed (default), draft, inProgress
  --package <id>    application id, default io.joao.worldclock
  --notes <dir>     fastlane metadata root holding <locale>/changelogs/<versionCode>.txt
  --dry-run         check authentication and edit access; no upload or commit
  --print-next-version-code
                    print one more than the highest code Play has ever seen, and nothing else,
                    so a build can be stamped without anyone remembering the last number
`

/** The service account key, accepted raw or base64 so it survives any secret store. */
function readServiceAccount () {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON
  if (!raw || !raw.trim()) {
    fail(
      'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not set.\n' +
      '  Create a service account in Google Cloud, grant it access in Play Console under\n' +
      '  Users and permissions, download its JSON key and put the file contents in that variable.',
    )
  }
  const text = raw.trim().startsWith('{')
    ? raw
    : Buffer.from(raw.replace(/\s/g, ''), 'base64').toString('utf8')
  let key
  try {
    key = JSON.parse(text)
  } catch {
    fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is neither JSON nor base64 of JSON.')
  }
  for (const field of ['client_email', 'private_key']) {
    if (!key[field]) fail(`The service account key has no ${field}. Download the JSON key again.`)
  }
  if (key.type && key.type !== 'service_account') {
    fail(`Expected a service account key, got type "${key.type}". OAuth client secrets will not work here.`)
  }
  return key
}

function base64url (input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Self-signed JWT exchanged for an access token: the documented flow, done by hand. */
async function accessToken (key) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  let signature
  try {
    signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(key.private_key)
  } catch (error) {
    fail(`The private key in the service account JSON could not sign: ${error.message}`)
  }
  const assertion = `${header}.${claims}.${signature.toString('base64url')}`
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  })
  const body = await response.json().catch(() => ({}))
  if (!response.ok) {
    fail(
      `Google refused the service account (${response.status} ${body.error ?? ''} ${body.error_description ?? ''}).\n` +
      '  Check the key is current, and that the Google Play Android Developer API is enabled for its project.',
    )
  }
  return body.access_token
}

async function call (token, url, { method = 'GET', body, headers = {}, raw } = {}) {
  const response = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(raw ? {} : body ? { 'content-type': 'application/json' } : {}),
      ...headers,
    },
    body: raw ?? (body ? JSON.stringify(body) : undefined),
  })
  const text = await response.text()
  let parsed = {}
  try { parsed = text ? JSON.parse(text) : {} } catch { /* upload replies can be empty */ }
  if (!response.ok) {
    const message = parsed?.error?.message ?? text.slice(0, 400)
    if (response.status === 401 || response.status === 403) {
      fail(
        `Play rejected the request (${response.status}): ${message}\n` +
        '  The service account is authenticated but may lack permission. In Play Console open\n' +
        '  Users and permissions, invite the service account email, and grant Release to testing\n' +
        '  tracks plus access to this specific app.',
      )
    }
    fail(`Play API ${method} failed (${response.status}): ${message}`)
  }
  return parsed
}

/** Release notes per locale, keyed by the version code Play assigned to the upload. */
async function releaseNotes (root, versionCode) {
  let locales = []
  try {
    locales = (await readdir(root, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name)
  } catch {
    console.log(`  ! No metadata directory at ${root}; uploading without release notes.`)
    return []
  }
  const notes = []
  for (const locale of locales) {
    const file = join(root, locale, 'changelogs', `${versionCode}.txt`)
    try {
      const text = (await readFile(file, 'utf8')).trim()
      if (text) notes.push({ language: locale, text: text.slice(0, 500) })
    } catch { /* a locale without notes for this build is not an error */ }
  }
  if (notes.length === 0) {
    console.log(`  ! No changelogs/${versionCode}.txt in any locale under ${root}.`)
    console.log('    Play shows the previous notes when a release provides none.')
  }
  return notes
}

/**
 * One more than the highest version code Play has ever accepted for this app.
 *
 * Asks for every uploaded bundle rather than reading the live tracks: a code is burned the moment
 * it is uploaded, even if that build was never released or was later superseded, and reusing one is
 * rejected at upload time with the build already made. This is also why the number cannot simply be
 * a CI run number, which restarts at 1 for a new workflow and would collide with what is published.
 */
async function nextVersionCode (token, packageName) {
  const edits = `${API}/applications/${encodeURIComponent(packageName)}/edits`
  const edit = await call(token, edits, { method: 'POST' })
  try {
    const list = await call(token, `${edits}/${edit.id}/bundles`)
    const codes = (list.bundles ?? []).map(b => Number(b.versionCode)).filter(Number.isFinite)
    return codes.length ? Math.max(...codes) + 1 : 1
  } finally {
    await call(token, `${edits}/${edit.id}`, { method: 'DELETE' }).catch(() => {})
  }
}

export async function main () {
  const options = parseArgs(process.argv.slice(2))
  const key = readServiceAccount()

  // Prints a bare number on stdout and nothing else, so it can be captured by a shell.
  if (options.printNextVersionCode) {
    const token = await accessToken(key)
    process.stdout.write(String(await nextVersionCode(token, options.package)))
    return
  }

  console.log(`  Service account: ${key.client_email}`)
  console.log(`  Application:     ${options.package}`)
  console.log(`  Track:           ${options.track}`)

  const token = await accessToken(key)
  console.log('  Authenticated with Google.')

  const edits = `${API}/applications/${encodeURIComponent(options.package)}/edits`
  const edit = await call(token, edits, { method: 'POST' })
  console.log(`  Opened edit ${edit.id}.`)

  if (options.dryRun) {
    await call(token, `${edits}/${edit.id}`, { method: 'DELETE' })
    console.log('\n  Dry run complete. Authentication and edit access verified. Upload and track permissions were not tested.')
    console.log('  Nothing was uploaded and no edit was committed.\n')
    return
  }

  if (!options.aab) fail('--aab is required. Point it at the signed bundle from bundleRelease.')
  const info = await stat(options.aab).catch(() => fail(`No bundle at ${options.aab}.`))
  const bytes = await readFile(options.aab)
  console.log(`  Uploading ${basename(options.aab)} (${(info.size / 1048576).toFixed(1)} MB)...`)

  // Resumable upload: a bundle is tens of megabytes and a simple upload has no way to recover.
  const start = await fetch(`${UPLOAD}/applications/${encodeURIComponent(options.package)}/edits/${edit.id}/bundles?uploadType=resumable`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-upload-content-type': 'application/octet-stream',
      'x-upload-content-length': String(info.size),
    },
  })
  if (!start.ok) fail(`Could not start the upload (${start.status}): ${(await start.text()).slice(0, 400)}`)
  const location = start.headers.get('location')
  if (!location) fail('Google did not return an upload URL.')

  const uploaded = await call(token, location, {
    method: 'PUT',
    raw: bytes,
    headers: { 'content-type': 'application/octet-stream' },
  })
  const versionCode = uploaded.versionCode
  if (!versionCode) fail('The upload succeeded but Play reported no version code.')
  console.log(`  Uploaded. Play assigned version code ${versionCode}.`)

  const notes = await releaseNotes(options.notes, versionCode)
  for (const note of notes) console.log(`  Release notes: ${note.language}`)

  await call(token, `${edits}/${edit.id}/tracks/${encodeURIComponent(options.track)}`, {
    method: 'PUT',
    body: {
      track: options.track,
      releases: [{
        versionCodes: [String(versionCode)],
        status: options.status,
        ...(notes.length ? { releaseNotes: notes } : {}),
      }],
    },
  })
  console.log(`  Assigned to the ${options.track} track as ${options.status}.`)

  await call(token, `${edits}/${edit.id}:commit`, { method: 'POST' })
  console.log(`\n  Submitted version code ${versionCode} to ${options.track} with status ${options.status}. Store availability is not verified.`)

  if (process.env.GITHUB_STEP_SUMMARY) {
    const { appendFile } = await import('node:fs/promises')
    await appendFile(process.env.GITHUB_STEP_SUMMARY, [
      '## Play upload',
      `- Application: \`${options.package}\``,
      `- Track: ${options.track} (${options.status})`,
      `- Version code: ${versionCode}`,
      `- Release notes: ${notes.length ? notes.map(n => n.language).join(', ') : 'none for this version code'}`,
      '',
    ].join('\n'))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  if (error instanceof Stop) return
  console.error(`\n  Deployment stopped: ${error?.stack ?? String(error)}\n`)
  process.exitCode = 1
})
