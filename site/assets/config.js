/* The one place for the product name, the version and launch links.
   - name: change it here and every visible name, the tab title, social tags and JSON-LD follow at load.
   - version: the app version the Installer and Portable buttons download. Bump it with each release (it must match
     the root package.json; cloudflare/check-links.mjs refuses a deploy when they differ).
   - downloadBase: where the installer and the portable exe live (Cloudflare R2, bucket owc-downloads, on its own
     domain). The direct downloads are <downloadBase>/Open-World-Clock-<version>-setup.exe and the same name ending in
     -portable.exe: the names the build gives the files (artifactName in the root package.json), uploaded as they are
     (PUBLISHING.md). Old versions stay in the bucket, so a link to an older file keeps working.
   - storeLive: false until the Microsoft Store listing is approved. While false, every Store button, the winget steps
     and the Store sentences ([data-store] elements) are hidden and their direct-download twins ([data-store-off]:
     "Download installer" and "Portable exe") show instead. The static HTML carries the same state, so nothing moves
     on load: after changing it, run node cloudflare/site-chrome.mjs --write (it flips the hidden attributes and the
     JSON-LD installUrl, sameAs and processorRequirements), then do the text files listed in site/README.md.
   - githubRepo: the source code, the license, issues and release notes. The exe files are not on GitHub.
   - The static HTML also spells "Open World Clock", the version, and the Store and GitHub links (for crawlers, link
     previews and no-JS visitors). site/README.md has the one-line replace that updates those too.
   - Store links carry a campaign id per placement (data-cid="site-hero" becomes ?cid=site-hero), so the Store's own
     reports show which button sent each visit. A visit that arrived with ?utm_source=reddit (letters, digits and
     hyphens, at most 24) adds it to every id: ?cid=site-hero-reddit. Anything else in utm_source is ignored, and
     nothing is stored, so the next page load without the parameter uses the plain ids again.
   - posthogKey: the PostHog project key (phc_...). While it is the placeholder, analytics.js does nothing at all.
     posthogHost is our own reverse proxy path (cloudflare/functions/ingest), so the browser never talks to posthog.com.
   - siteHost: analytics runs only on this hostname. Local previews (localhost, 127.0.0.1), *.pages.dev previews and
     any other host send nothing. */
window.SITE = {
  name: 'Open World Clock',
  version: '1.3.0',           // the release the Installer and Portable buttons download; keep in step with package.json
  storeLive: true,          // the Store listing is live (approved 2026-09-26): Store buttons shown, direct downloads as the alternative
  storeUrl: 'https://apps.microsoft.com/detail/9N88FR8M81BM',      // Microsoft Store listing, without ?cid (added per link)
  downloadBase: 'https://download.openworldclock.com', // the R2 bucket that serves the installer and portable exe
  githubRepo: 'joaoCarvalho1000/open-world-clock',  // "owner/repo": source, license, issues, release notes
  posthogKey: 'phc_qngHqsrdSs4wZChMLmqrpqN2HJj84i6vmnczAASJ4V5i',  // PostHog project API key, e.g. phc_XXXXXXXX (public by design)
  posthogHost: '/ingest',     // same-origin proxy path; must stay on this site's own domain
  posthogUi: 'https://us.posthog.com', // https://eu.posthog.com if POSTHOG_REGION is eu (toolbar links only)
  siteHost: 'openworldclock.com', // analytics runs only here (never on localhost, 127.0.0.1 or *.pages.dev previews)
  // the launch channel from ?utm_source=, made safe for a Store campaign id: '-reddit' or '' (pure, tested in node)
  cidSuffix: function (search) {
    var m = /(?:^|[?&])utm_source=([^&#]*)/.exec(String(search || ''));
    var v = '';
    if (m) { try { v = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { v = ''; } }
    return /^[a-z0-9-]{1,24}$/i.test(v) ? '-' + v.toLowerCase() : '';
  },
};

(function () {
  'use strict';
  var S = window.SITE;
  var BUILT_AS = 'Open World Clock'; // the name the static HTML was written with
  var swap = function (s) { return S.name === BUILT_AS ? s : String(s).split(BUILT_AS).join(S.name); };
  var repo = 'https://github.com/' + S.githubRepo;
  // the download files, named as the build names them (build.nsis and build.portable artifactName in package.json)
  var file = S.downloadBase + '/Open-World-Clock-' + S.version;
  var links = {
    store: S.storeUrl,
    repo: repo,
    setup: file + '-setup.exe',
    portable: file + '-portable.exe',
    issues: repo + '/issues',
    license: repo + '/blob/main/LICENSE',
  };

  function apply() {
    var tag = S.cidSuffix(window.location && window.location.search);
    // the Store switch; the static HTML already matches it (site-chrome.mjs), so normally this changes nothing
    document.querySelectorAll('[data-store]').forEach(function (el) { el.hidden = !S.storeLive; });
    document.querySelectorAll('[data-store-off]').forEach(function (el) { el.hidden = !!S.storeLive; });
    document.querySelectorAll('[data-name]').forEach(function (el) { el.textContent = S.name; });
    document.querySelectorAll('[data-link]').forEach(function (el) {
      var href = links[el.getAttribute('data-link')];
      var cid = el.getAttribute('data-cid');
      if (cid) cid += tag;
      if (href && cid) href += (href.indexOf('?') < 0 ? '?' : '&') + 'cid=' + encodeURIComponent(cid);
      if (href) el.setAttribute('href', href);
    });
    if (S.name === BUILT_AS) return;
    document.title = swap(document.title);
    document.querySelectorAll('meta[content], img[alt], [aria-label], [title]').forEach(function (el) {
      ['content', 'alt', 'aria-label', 'title'].forEach(function (a) {
        if (el.hasAttribute(a)) el.setAttribute(a, swap(el.getAttribute(a)));
      });
    });
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (el) { el.textContent = swap(el.textContent); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply);
  else apply();
})();
