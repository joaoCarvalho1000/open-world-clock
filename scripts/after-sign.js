// electron-builder afterSign hook (runs only when the app was signed, after app-update.yml is written): in a build with
// updates on, the emitted resources/app-update.yml must point at our feed and name the configured publisher, so the
// shipped updater refuses an installer signed by anyone else (SEC-2). after-pack.js already refused the configuration
// that cannot produce this; this checks the file that actually ships. Builds with updates off are not affected.
const fs = require('fs');
const path = require('path');
const { configuredPublisher, checkUpdateConfig } = require('../src/update-config.js');
const { checkUpdater } = require('./after-pack.js');

// Pure check, for tests: `ymlText` is the emitted file's text (or null when absent), `winOptions` the merged win config.
function checkEmittedUpdateConfig({ updates, ymlText, winOptions = {}, loadYaml = require('js-yaml').load }) {
  if (!updates) return null;
  if (ymlText == null) throw new Error('wcUpdates is true but the packaged app has no resources/app-update.yml, so it could not update safely.');
  let cfg;
  try { cfg = loadYaml(ymlText); } catch (e) { throw new Error(`app-update.yml does not parse: ${e.message}`); }
  const expected = configuredPublisher(winOptions);
  if (!expected) throw new Error('wcUpdates is true but no publisher name is configured to compare app-update.yml with.');
  const r = checkUpdateConfig(cfg, expected);
  if (!r.ok) throw new Error(`app-update.yml would not authenticate the expected publisher: ${r.reason}`);
  return r.publishers;
}

module.exports = async function afterSign(context) {
  if (context.electronPlatformName !== 'win32') return;
  const resourcesDir = path.join(context.appOutDir, 'resources');
  const { updates } = checkUpdater(resourcesDir);
  const file = path.join(resourcesDir, 'app-update.yml');
  const ymlText = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  const publishers = checkEmittedUpdateConfig({ updates, ymlText, winOptions: context.packager.platformSpecificBuildOptions || {} });
  if (publishers) console.log(`  • app-update.yml  feed and publisher checked (${publishers.join(', ')})`);
};
module.exports.checkEmittedUpdateConfig = checkEmittedUpdateConfig;
