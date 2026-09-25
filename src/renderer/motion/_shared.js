// Shared helpers for motion modules. Loaded before them.
(() => {
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
  // Motion tokens (tokens.css) only change under the reduced-motion query, so each is read from the computed style once
  // and cached; the cache is dropped when that query flips. Saves a style read on every animation.
  const cache = new Map();
  const onChange = () => cache.clear();
  if (typeof RM.addEventListener === 'function') RM.addEventListener('change', onChange);
  else if (typeof RM.addListener === 'function') RM.addListener(onChange);
  const css = (name, fallback) => {
    let v = cache.get(name);
    if (v === undefined) {
      v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      cache.set(name, v);
    }
    return v || (fallback === undefined ? '' : fallback);
  };
  window.WCMotion = {
    reduced: () => RM.matches,
    on: (name, fn) => document.addEventListener('wc:' + name, (e) => { try { fn(e.detail || {}); } catch (err) { console.warn('motion', name, err); } }),
    css,
    ms: (v) => parseFloat(css(v)) || 0,
  };
})();
