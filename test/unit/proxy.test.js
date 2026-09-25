// Unit tests for cloudflare/lib/posthog-proxy.js: path allowlist, forwarded headers, body size limit, methods.
// The proxy is an ES module (cloudflare/package.json has "type": "module"); Node's global fetch types stand in for
// the Workers runtime, and globalThis.fetch is stubbed so nothing leaves the machine.
const { test, before, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

let P;
const realFetch = globalThis.fetch;
let calls = [];
before(async () => {
  P = await import(pathToFileURL(path.resolve(__dirname, '../../cloudflare/lib/posthog-proxy.js')).href);
});
afterEach(() => { globalThis.fetch = realFetch; calls = []; });

// Upstream stub: records the request and answers with a Set-Cookie to check it is stripped.
function stubFetch(status = 200) {
  globalThis.fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const body = req.body ? Buffer.from(await req.arrayBuffer()) : null;
    calls.push({ url: req.url, method: req.method, headers: req.headers, body });
    return new Response('ok', { status, headers: { 'set-cookie': 'ph=1; Path=/', 'access-control-allow-origin': '*', 'content-type': 'text/plain' } });
  };
}
const KEY = () => P.DEFAULT_KEY;
const req = (p, init = {}) => new Request('https://openworldclock.com/ingest' + p, init);

test('route: allowlisted paths', () => {
  assert.deepEqual(P.route('/static/array.js'), { kind: 'asset', path: '/static/array.js', methods: ['GET'] });
  assert.equal(P.route(`/array/${KEY()}/config`).kind, 'asset');
  assert.equal(P.route(`/array/${KEY()}/config.js`).kind, 'asset');
  for (const p of ['/e/', '/i/v0/e/', '/batch/', '/flags/', '/decide/']) {
    assert.deepEqual(P.route(p), { kind: 'api', path: p, methods: ['GET', 'POST'] }, p);
    assert.equal(P.route(p.slice(0, -1)).path, p, 'no trailing slash normalizes: ' + p);
  }
});

test('route: everything else is refused', () => {
  const bad = [
    '/', '', 'e/', '/static/', '/static/recorder.js', '/static/array.full.js', '/static/../e/', '/static/array.js/x',
    '/array/phc_someoneElseKey1234567/config', `/array/${KEY()}/settings`, `/array/${KEY()}/config/x`,
    '/api/projects/', '/s/', '/engage/', '/capture/', '/i/v0/e/x', '/e/x', '//e/', '/e//', '/E/', '/decide/../api/',
    '/%2e%2e/api/', '/batch\\', '/flags/?',
  ];
  for (const p of bad) assert.equal(P.route(p), null, JSON.stringify(p));
});

test('route: POSTHOG_KEY env selects which remote config is allowed', () => {
  const env = { POSTHOG_KEY: 'phc_AAAAAAAAAAAAAAAAAAAAAAAA' };
  assert.equal(P.route('/array/phc_AAAAAAAAAAAAAAAAAAAAAAAA/config', env).kind, 'asset');
  assert.equal(P.route(`/array/${KEY()}/config`, env), null);
  assert.equal(P.route(`/array/${KEY()}/config`, { POSTHOG_KEY: 'not a key' }).kind, 'asset', 'malformed env key falls back to the default');
});

test('forwardHeaders: allowlist plus X-Forwarded-For from CF-Connecting-IP only', () => {
  const h = P.forwardHeaders(new Headers({
    'content-type': 'text/plain', 'content-encoding': 'gzip', 'user-agent': 'UA', accept: '*/*', 'accept-encoding': 'gzip, br',
    cookie: 'a=b', authorization: 'Bearer x', referer: 'https://openworldclock.com/?q=secret', origin: 'https://openworldclock.com',
    'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '10.0.0.1, 198.51.100.2', 'cf-ipcountry': 'PT', 'x-real-ip': '1.2.3.4',
  }));
  assert.deepEqual(Object.fromEntries(h), {
    accept: '*/*', 'accept-encoding': 'gzip, br', 'content-encoding': 'gzip', 'content-type': 'text/plain', 'user-agent': 'UA',
    'x-forwarded-for': '203.0.113.9',
  });
  assert.equal(P.forwardHeaders(new Headers({ 'x-forwarded-for': 'spoofed' })).get('x-forwarded-for'), null, 'client X-Forwarded-For is never trusted');
});

test('declaredTooLarge and readBodyLimited enforce 64 KB', async () => {
  assert.equal(P.MAX_BODY, 65536);
  assert.equal(P.declaredTooLarge(new Headers({ 'content-length': '65536' })), false);
  assert.equal(P.declaredTooLarge(new Headers({ 'content-length': '65537' })), true);
  assert.equal(P.declaredTooLarge(new Headers({ 'content-length': 'abc' })), true);
  assert.equal(P.declaredTooLarge(new Headers()), false);
  const ok = await P.readBodyLimited(new Request('https://x/', { method: 'POST', body: new Uint8Array(65536) }));
  assert.equal(ok.byteLength, 65536);
  const big = await P.readBodyLimited(new Request('https://x/', { method: 'POST', body: new Uint8Array(65537) }));
  assert.equal(big, null);
});

test('proxy: methods other than GET, POST, OPTIONS are 405', async () => {
  stubFetch();
  for (const method of ['HEAD', 'PUT', 'DELETE', 'PATCH']) {
    const res = await P.proxy(req('/e/', { method }), {});
    assert.equal(res.status, 405, method);
    assert.equal(res.headers.get('allow'), 'GET, POST, OPTIONS');
  }
  assert.equal(calls.length, 0);
});

test('proxy: unknown paths are 404 and never reach upstream', async () => {
  stubFetch();
  for (const p of ['/api/projects/', '/static/toolbar.js', '/', '/s/', '/array/phc_other1234567890123/config']) {
    const res = await P.proxy(req(p), {});
    assert.equal(res.status, 404, p);
  }
  assert.equal((await P.proxy(req('/e/', { method: 'OPTIONS' }).clone(), {})).status, 204);
  assert.equal((await P.proxy(req('/nope/', { method: 'OPTIONS' }), {})).status, 404);
  assert.equal(calls.length, 0);
});

test('proxy: POST to an asset path is 405; OPTIONS is answered locally', async () => {
  stubFetch();
  assert.equal((await P.proxy(req('/static/array.js', { method: 'POST', body: 'x' }), {})).status, 405);
  const opt = await P.proxy(req('/static/array.js', { method: 'OPTIONS' }), {});
  assert.equal(opt.status, 204);
  assert.equal(opt.headers.get('allow'), 'GET, OPTIONS');
  assert.equal(calls.length, 0);
});

test('proxy: event POST forwards body, allowlisted headers and query; strips Set-Cookie', async () => {
  stubFetch();
  const res = await P.proxy(req('/e/?ip=0&ver=1.434.11', {
    method: 'POST', body: '{"event":"$pageview"}',
    headers: { 'content-type': 'text/plain', cookie: 'x=1', referer: 'https://openworldclock.com/', authorization: 'x', 'cf-connecting-ip': '203.0.113.9' },
  }), { POSTHOG_REGION: 'eu' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(res.headers.get('access-control-allow-origin'), null);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.url, 'https://eu.i.posthog.com/e/?ip=0&ver=1.434.11');
  assert.equal(c.method, 'POST');
  assert.equal(c.body.toString(), '{"event":"$pageview"}');
  assert.equal(c.headers.get('cookie'), null);
  assert.equal(c.headers.get('referer'), null);
  assert.equal(c.headers.get('authorization'), null);
  assert.equal(c.headers.get('x-forwarded-for'), '203.0.113.9');
});

test('proxy: bodies over 64 KB are 413, by header or by actual size', async () => {
  stubFetch();
  const byHeader = await P.proxy(req('/batch/', { method: 'POST', body: 'x', headers: { 'content-length': String(65537) } }), {});
  assert.equal(byHeader.status, 413);
  // a streamed body has no Content-Length, so only the buffered count can catch it
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < 5; i++) c.enqueue(new Uint8Array(20000)); c.close(); } });
  const bySize = await P.proxy(req('/batch/', { method: 'POST', body: stream, duplex: 'half' }), {});
  assert.equal(bySize.status, 413);
  const fits = await P.proxy(req('/batch/', { method: 'POST', body: new Uint8Array(65536) }), {});
  assert.equal(fits.status, 200);
  assert.equal(calls.length, 1);
});

test('proxy: assets go to the asset host without the query string and without Set-Cookie', async () => {
  stubFetch();
  const res = await P.proxy(req('/static/array.js?v=cachebust'), {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(calls[0].url, 'https://us-assets.i.posthog.com/static/array.js');
  const cfg = await P.proxy(req(`/array/${KEY()}/config`), {});
  assert.equal(cfg.status, 200);
  assert.equal(calls[1].url, `https://us-assets.i.posthog.com/array/${KEY()}/config`);
});

test('proxy: upstream failure is a 502 with no details', async () => {
  globalThis.fetch = async () => { throw new Error('boom'); };
  const orig = console.error; console.error = () => {};
  try {
    const res = await P.proxy(req('/flags/', { method: 'POST', body: '{}' }), {});
    assert.equal(res.status, 502);
    assert.equal(await res.text(), 'Upstream error');
  } finally { console.error = orig; }
});

test('proxy: the standalone Worker prefix works the same way', async () => {
  stubFetch();
  const res = await P.proxy(new Request('https://openworldclock.com/ph/e/', { method: 'POST', body: '{}' }), {}, null, '/ph');
  assert.equal(res.status, 200);
  assert.equal(calls[0].url, 'https://us.i.posthog.com/e/');
});
