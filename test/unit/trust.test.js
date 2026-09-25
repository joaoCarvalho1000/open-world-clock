// Unit tests for src/url-trust.js: IPC is trusted only from the app's own page, app://owc/index.html (the renderer is
// served from that custom scheme, so the page URL is the same in every install folder).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('url');
const { isAppUrl, APP_INDEX } = require('../../src/url-trust');

test('the page URL is app://owc/index.html', () => {
  assert.equal(APP_INDEX, 'app://owc/index.html');
});

test('trusted: the page, with or without a query or hash', () => {
  for (const u of ['app://owc/index.html', 'app://owc/index.html?q=1', 'app://owc/index.html#h', 'app://owc/index.html?q=1#h']) {
    assert.equal(isAppUrl(u), true, u);
  }
});

test('refused: another host, another path, dot segments, credentials, a port', () => {
  for (const u of [
    'app://other/index.html',
    'app://owc.evil/index.html',
    'app://owc/../index.html',
    'app://owc/./index.html',
    'app://owc/x.html',
    'app://owc/index.html.evil',
    'app://owc/sub/index.html',
    'app://owc/',
    'app://owc',
    'app://user@owc/index.html',
    'app://owc:8080/index.html',
    'APP://owc/index.html',
    'app://OWC/index.html',
  ]) assert.equal(isAppUrl(u), false, u);
});

test('refused: the old file:// page, web pages and garbage', () => {
  const file = pathToFileURL(process.platform === 'win32' ? 'C:\\Apps\\Open World Clock\\resources\\app.asar\\src\\renderer\\index.html' : '/opt/owc/resources/app.asar/src/renderer/index.html').href;
  for (const u of [file, 'file:///C:/Users/JOHNSM~1/AppData/Local/Temp/x/resources/app.asar/src/renderer/index.html', 'https://openworldclock.com/index.html',
    'http://owc/index.html', 'about:blank', 'devtools://devtools/bundled/index.html', 'javascript:alert(1)', '', 'app:', null, undefined, 42, {}]) {
    assert.equal(isAppUrl(u), false, String(u));
  }
});
