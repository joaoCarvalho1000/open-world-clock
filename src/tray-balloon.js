// Which tray notification is on screen: the close-to-tray hint or an update notice. Windows reports balloon events
// without saying which balloon they belong to, so main records the kind it showed last, and a click is credited to
// that kind only. A close, or a newer balloon replacing it, ends it, so a click is never mistaken for the other one.
function createBalloonTracker() {
  let kind = null;
  return {
    get kind() { return kind; },
    shown(k) { kind = k; },
    closed() { kind = null; },
    clicked() { const k = kind; kind = null; return k; },
  };
}
module.exports = { createBalloonTracker };
