// The fixed update endpoints and the check of an updater configuration (app-update.yml), shared by the build hooks
// (scripts/after-pack.js, scripts/after-sign.js) and main (src/main.js, before electron-updater is ever loaded).
// Nothing here does I/O: callers read and parse the file and pass the object.
'use strict';

// Signed installer: electron-updater reads latest.yml from here (package.json build.publish).
const FEED_URL = 'https://download.openworldclock.com';
// Every other packaged website copy: version discovery only, from the site's app metadata (softwareVersion).
const DISCOVERY_URL = 'https://openworldclock.com/api/app.json';
// The one page a "new version" action opens (main's openExternalSafe allows this host).
const DOWNLOAD_PAGE = 'https://openworldclock.com/download#new';

const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

// The publisher names an update must be signed by: a nonempty string, or a nonempty list of nonempty strings.
// Returns the list, or null when there is none (electron-updater then skips the signature check entirely).
function publisherList(v) {
  if (nonEmpty(v)) return [v.trim()];
  if (Array.isArray(v) && v.length > 0 && v.every(nonEmpty)) return v.map((s) => s.trim());
  return null;
}

// The publisher a build's Windows options resolve to (azureSignOptions or signtoolOptions, as scripts/signing.js sets),
// or null. A certificate thumbprint or file alone is not accepted: its name is only known after signing.
function configuredPublisher(winOptions = {}) {
  const a = winOptions.azureSignOptions || {}, s = winOptions.signtoolOptions || {};
  return publisherList(a.publisherName) || publisherList(s.publisherName) || publisherList(winOptions.publisherName);
}

// Checks a parsed app-update.yml: generic provider, exactly our feed, and a publisher to verify against.
// `expected` (optional, a list) must then equal it. Returns { ok: true, publishers } or { ok: false, reason }.
function checkUpdateConfig(cfg, expected) {
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return { ok: false, reason: 'app-update.yml is missing or not a mapping' };
  if (cfg.provider !== 'generic') return { ok: false, reason: `provider is ${JSON.stringify(cfg.provider)}, not "generic"` };
  if (String(cfg.url || '').replace(/\/+$/, '') !== FEED_URL) return { ok: false, reason: `url is ${JSON.stringify(cfg.url)}, not ${FEED_URL}` };
  const publishers = publisherList(cfg.publisherName);
  if (!publishers) return { ok: false, reason: 'publisherName is missing or empty, so updates would not be checked for the publisher signature' };
  if (expected && JSON.stringify([...publishers].sort()) !== JSON.stringify([...expected].sort())) {
    return { ok: false, reason: `publisherName ${JSON.stringify(publishers)} is not the expected ${JSON.stringify(expected)}` };
  }
  return { ok: true, publishers };
}

module.exports = { FEED_URL, DISCOVERY_URL, DOWNLOAD_PAGE, publisherList, configuredPublisher, checkUpdateConfig };
