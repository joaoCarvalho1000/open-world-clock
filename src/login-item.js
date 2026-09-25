// Launch at login follows Windows. Given what the app wants (settings.launchAtLogin), the Run entry Windows has for
// this app (a launchItems entry from app.getLoginItemSettings, name === the AppUserModelId) and the exe that should
// start, decide what to do:
//   'none'        nothing to change
//   'settingOff'  the entry is gone, or the user turned it off in Task Manager > Startup apps (or Settings > Apps >
//                 Startup): show the checkbox off and leave the registry alone, so the user's choice stands
//   'rewrite'     the entry is on but points at another exe (an upgrade renamed World Clock.exe to Open World Clock.exe):
//                 register the current exe
//   'settingOn'   the setting is off but Windows has an enabled entry for this exe (the user turned it back on in Task
//                 Manager or Settings > Apps > Startup after the switch went off): show the checkbox on, registry untouched
// Pure (no Electron), unit-tested in test/unit/login-item.test.js.
const path = require('path');

const samePath = (a, b) => {
  try { return path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase(); } catch { return false; }
};

// Electron reads the Run value as a command line, and setLoginItemSettings writes the exe path unquoted, so a path with
// spaces comes back split: path "...\Open", args ["World", "Clock.exe"]. Joined again it is the exe we registered.
const itemExe = (item) => [item.path, ...(Array.isArray(item.args) ? item.args : [])].join(' ');

function loginItemAction({ want, item, exe } = {}) {
  if (!want) {
    const on = !!item && item.enabled !== false && !!item.path && !!exe && (samePath(item.path, exe) || samePath(itemExe(item), exe));
    return on ? 'settingOn' : 'none';
  }
  if (!item || item.enabled === false) return 'settingOff';
  if (!item.path || !exe || !(samePath(item.path, exe) || samePath(itemExe(item), exe))) return 'rewrite';
  return 'none';
}

module.exports = { loginItemAction };
