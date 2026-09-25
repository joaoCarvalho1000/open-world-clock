// Pages Function: https://<site>/ingest/* -> PostHog (US or EU), so the browser only ever talks to our own domain.
// Only /ingest/* runs this code (site/_routes.json); every other path is served as a static file.
import { proxy } from '../../lib/posthog-proxy.js';

export const onRequest = (context) => proxy(context.request, context.env, context, '/ingest');
