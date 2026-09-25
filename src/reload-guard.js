// Crash recovery backoff for the renderer. A page that crashes again right after each reload would otherwise reload in a
// tight loop, burning CPU behind a window that never shows. next(now) records a crash and returns how long to wait
// before reloading: 500 ms, then 1 s, 2 s, 4 s, 8 s (doubling, at most 30 s) for crashes within the last `windowMs`,
// or null once `max` crashes happened in that window (stop reloading). reset() forgets the history (the user asked
// for the window again: tray Show/Hide or a second launch).
// Pure (no Electron), unit-tested in test/unit/reload-guard.test.js.
function createReloadGuard({ max = 5, windowMs = 120000 } = {}) {
  let crashes = [];
  return {
    next(now = Date.now()) {
      crashes = crashes.filter((t) => now - t < windowMs);
      crashes.push(now);
      const n = crashes.length;
      if (n > max) return null;
      return Math.min(30000, 500 * 2 ** (n - 1));
    },
    reset() { crashes = []; },
    get count() { return crashes.length; },
  };
}

module.exports = { createReloadGuard };
