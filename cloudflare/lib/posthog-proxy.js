// Same-origin reverse proxy for PostHog, after PostHog's Cloudflare proxy guide
// (https://posthog.com/docs/advanced/proxy/cloudflare), shared by the Pages Function
// (functions/ingest/[[path]].js) and the optional standalone Worker (worker/index.js).
//
// Allowlist only (anything else is a 404, so the proxy can never be used to reach other PostHog endpoints):
//   GET        /ingest/static/array.js                   -> asset host (the SDK loader), edge cached
//   GET        /ingest/array/<project key>/config(.js)   -> asset host (remote config), edge cached
//   GET, POST  /ingest/e/  /i/v0/e/  /batch/  /flags/  /decide/   -> API host (events), never cached
//   OPTIONS    on any allowed path: answered here with 204 (same-origin requests need no CORS headers)
// Only the SDK files the site's config can request are listed: analytics.js sets disable_external_dependency_loading,
// so array.js never lazy-loads recorder, surveys, toolbar or other extension bundles. Add a name to STATIC_FILES
// if a future config turns one of those on.
//
// Requests: bodies over 64 KB are refused (413), whether announced by Content-Length or not. Only the headers in
// FORWARD_HEADERS go upstream, plus X-Forwarded-For from CF-Connecting-IP; Cookie, Authorization and Referer never do.
// Responses: Set-Cookie and CORS headers are removed.
//
// Env vars:
//   POSTHOG_REGION      "us" (default) or "eu"
//   POSTHOG_HOST        optional override for the API host, e.g. "eu.i.posthog.com" or a full https:// origin
//   POSTHOG_ASSET_HOST  optional override for the asset host (derived from POSTHOG_HOST when that is a *.i.posthog.com host)
//   POSTHOG_KEY         the project key (phc_...) whose remote config may be fetched; defaults to DEFAULT_KEY below,
//                       which must match site/assets/config.js posthogKey

const REGIONS = {
  us: { api: 'https://us.i.posthog.com', assets: 'https://us-assets.i.posthog.com' },
  eu: { api: 'https://eu.i.posthog.com', assets: 'https://eu-assets.i.posthog.com' },
};

export const DEFAULT_KEY = 'phc_xNf9EdeZoqL2EFKCngCxqubrNddx8VpDXCNMGGn5RaAT';
export const MAX_BODY = 64 * 1024;
export const METHODS = ['GET', 'POST', 'OPTIONS'];
export const STATIC_FILES = new Set(['array.js']);
export const API_PATHS = new Set(['/e/', '/i/v0/e/', '/batch/', '/flags/', '/decide/']);
export const FORWARD_HEADERS = ['content-type', 'content-encoding', 'user-agent', 'accept', 'accept-encoding'];
const ALLOW = METHODS.join(', ');
const NOINDEX = { 'x-robots-tag': 'noindex', 'cache-control': 'no-store' };

function origin(v) {
  if (!v) return '';
  let s = String(v).trim().replace(/\/+$/, '');
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s;
}

export function upstreams(env = {}) {
  const region = REGIONS[String(env.POSTHOG_REGION || 'us').trim().toLowerCase()] || REGIONS.us;
  const api = origin(env.POSTHOG_HOST) || region.api;
  const assets = origin(env.POSTHOG_ASSET_HOST)
    || (env.POSTHOG_HOST ? api.replace('.i.posthog.com', '-assets.i.posthog.com') : region.assets);
  return { api, assets };
}

function projectKey(env = {}) {
  const k = String(env.POSTHOG_KEY || '').trim();
  return /^phc_[A-Za-z0-9]{16,64}$/.test(k) ? k : DEFAULT_KEY;
}

// Classifies a path (already stripped of the /ingest prefix). Returns
//   { kind: 'asset' | 'api', path, methods }  for an allowed path (path normalized, e.g. "/e" -> "/e/"), or
//   null                                      for anything else (404).
export function route(path, env = {}) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('..') || path.includes('//') || path.includes('\\')) return null;
  const file = /^\/static\/([A-Za-z0-9._-]+)$/.exec(path);
  if (file) return STATIC_FILES.has(file[1]) ? { kind: 'asset', path, methods: ['GET'] } : null;
  const cfg = /^\/array\/([^/]+)\/(config|config\.js)$/.exec(path);
  if (cfg) return cfg[1] === projectKey(env) ? { kind: 'asset', path, methods: ['GET'] } : null;
  const api = path.endsWith('/') ? path : path + '/';
  if (API_PATHS.has(api)) return { kind: 'api', path: api, methods: ['GET', 'POST'] };
  return null;
}

// Upstream request headers: the allowlist only, plus the visitor IP. Nothing identifying (Cookie, Authorization,
// Referer, CF-*, X-Forwarded-*) is passed through.
export function forwardHeaders(incoming) {
  const src = incoming instanceof Headers ? incoming : new Headers(incoming || {});
  const out = new Headers();
  for (const name of FORWARD_HEADERS) {
    const v = src.get(name);
    if (v !== null) out.set(name, v);
  }
  const ip = src.get('cf-connecting-ip');
  if (ip) out.set('x-forwarded-for', ip); // PostHog needs it for the cookieless daily hash and rough country
  return out;
}

// True when the Content-Length header alone already says the body is too big (or is malformed).
export function declaredTooLarge(headers, limit = MAX_BODY) {
  const raw = headers.get('content-length');
  if (raw === null) return false;
  if (!/^\d+$/.test(raw.trim())) return true;
  return Number(raw) > limit;
}

// Reads the body, giving up as soon as it passes `limit` bytes. Resolves to an ArrayBuffer, or null when too large.
export async function readBodyLimited(request, limit = MAX_BODY) {
  if (!request.body) return new ArrayBuffer(0);
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      try { await reader.cancel(); } catch { /* ignore */ }
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { out.set(c, at); at += c.byteLength; }
  return out.buffer;
}

// Headers every proxied response gets (Pages does not apply site/_headers to Function responses).
export function finish(upstream, extra) {
  const res = new Response(upstream.body, upstream);
  res.headers.delete('set-cookie');
  res.headers.delete('set-cookie2');
  res.headers.delete('access-control-allow-origin');
  res.headers.delete('access-control-allow-credentials');
  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('x-robots-tag', 'noindex');
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  for (const [k, v] of Object.entries(extra || {})) res.headers.set(k, v);
  return res;
}

const reply = (status, text, extra) => new Response(text, { status, headers: { ...NOINDEX, ...(extra || {}) } });

async function retrieveAsset(target, ctx) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(target, { method: 'GET' });
  let hit = null;
  try { hit = cache ? await cache.match(key) : null; } catch { hit = null; } // a cache problem must never break the SDK
  if (hit) return finish(hit);
  const res = finish(await fetch(target)); // no visitor headers needed for a public file; cleaned first, so no Set-Cookie ever reaches the cache
  if (cache && res.ok) {
    const put = cache.put(key, res.clone()).catch(() => {});
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  }
  return res;
}

async function forwardRequest(request, target) {
  let body = null;
  if (request.method === 'POST') {
    body = await readBodyLimited(request, MAX_BODY);
    if (body === null) return reply(413, 'Payload too large');
  }
  const res = await fetch(new Request(target, {
    method: request.method,
    headers: forwardHeaders(request.headers),
    body,
    redirect: 'manual',
  }));
  return finish(res, { 'cache-control': 'no-store' });
}

export async function proxy(request, env, ctx, prefix = '/ingest') {
  if (!METHODS.includes(request.method)) return reply(405, 'Method not allowed', { allow: ALLOW });
  const url = new URL(request.url);
  let path = url.pathname;
  if (prefix && (path === prefix || path.startsWith(prefix + '/'))) path = path.slice(prefix.length);
  const r = route(path, env);
  if (!r) return reply(404, 'Not found');
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...NOINDEX, allow: [...r.methods, 'OPTIONS'].join(', ') } });
  if (!r.methods.includes(request.method)) return reply(405, 'Method not allowed', { allow: [...r.methods, 'OPTIONS'].join(', ') });
  if (declaredTooLarge(request.headers)) return reply(413, 'Payload too large');
  const { api, assets } = upstreams(env);
  // Assets drop the query string (nothing the SDK sends there needs one, and it keeps the cache from being busted).
  const target = r.kind === 'asset' ? assets + r.path : api + r.path + url.search;
  try {
    return r.kind === 'asset' ? await retrieveAsset(target, ctx) : await forwardRequest(request, target);
  } catch (err) {
    console.error('posthog proxy', r.kind, r.path, err && err.stack || err); // visible in `wrangler pages deployment tail`
    return reply(502, 'Upstream error');
  }
}
