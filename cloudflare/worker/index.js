// Optional standalone Worker with the same proxy, for hosting the static site somewhere other than Cloudflare Pages
// (or if you prefer a Worker route over Pages Functions). Do not run both on the same hostname.
import { proxy } from '../lib/posthog-proxy.js';

export default {
  fetch(request, env, ctx) {
    return proxy(request, env, ctx, env.PROXY_PREFIX || '/ingest');
  },
};
