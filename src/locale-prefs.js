// First-run clock format: does this locale write times with a 12-hour clock (hourCycle h11 or h12)? main.js asks it
// once, for the Windows Region format (app.getSystemLocale(), for example 'en-US' or 'pt-BR'), before the first window.
// An empty or unknown locale, or any error, means 24-hour (the app default).
// Pure (no Electron), unit-tested in test/unit/locale-prefs.test.js.
function prefers12h(locale) {
  if (typeof locale !== 'string' || !locale.trim()) return false;
  try {
    const tag = locale.trim();
    // An unknown locale would silently resolve to the process default: treat it as unknown instead.
    if (!Intl.DateTimeFormat.supportedLocalesOf([tag]).length) return false;
    const hc = new Intl.DateTimeFormat(tag, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return hc === 'h11' || hc === 'h12';
  } catch {
    return false;
  }
}

module.exports = { prefers12h };
