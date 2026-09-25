// Is `url` the app's own page? The renderer is served from the custom scheme app://owc (main.js protocol.handle), so
// the page URL no longer depends on the install folder (file:// URLs did: Node and Chromium encode ~ [ ] % differently,
// which broke the old path compare in folders such as an 8.3 %TEMP% or 'sq[1] pct% João'). Exactly
// app://owc/index.html, with any query or hash ignored; no credentials, port, other host, other path or dot segments.
// Pure (no Electron), unit-tested in test/unit/trust.test.js.
const APP_ORIGIN = 'app://owc';
const APP_INDEX = APP_ORIGIN + '/index.html';

function isAppUrl(url) {
  try {
    if (typeof url !== 'string') return false;
    // Compared as written (Chromium normalizes the page URL of a standard scheme, so the real one is always this form).
    if (url.split(/[?#]/)[0] !== APP_INDEX) return false;
    const u = new URL(url);
    return u.protocol === 'app:' && u.host === 'owc' && u.pathname === '/index.html' && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}

module.exports = { isAppUrl, APP_ORIGIN, APP_INDEX };
