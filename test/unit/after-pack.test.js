// scripts/after-pack.js checkUpdater: a build that turns auto-update on (wcUpdates) must ship electron-updater, or it
// fails; the default build (updates off) passes without it. Uses real app.asar files built in a temp folder.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const asar = require('@electron/asar');
const { checkUpdater } = require('../../scripts/after-pack.js');

async function makeResources(pkg, withUpdater, { packAsar = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'owc-afterpack-'));
  const app = path.join(root, 'app-src');
  fs.mkdirSync(path.join(app, 'src'), { recursive: true });
  fs.writeFileSync(path.join(app, 'package.json'), JSON.stringify(pkg));
  fs.writeFileSync(path.join(app, 'src', 'main.js'), '');
  if (withUpdater) {
    fs.mkdirSync(path.join(app, 'node_modules', 'electron-updater'), { recursive: true });
    fs.writeFileSync(path.join(app, 'node_modules', 'electron-updater', 'package.json'), '{"name":"electron-updater"}');
  }
  const resources = path.join(root, 'resources');
  fs.mkdirSync(resources);
  if (packAsar) await asar.createPackage(app, path.join(resources, 'app.asar'));
  else fs.renameSync(app, path.join(resources, 'app'));
  return { root, resources };
}

const cases = [
  ['updates off, no updater (the default build)', { wcUpdates: false }, false, true],
  ['updates key missing, no updater', {}, false, true],
  ['updates on, updater packaged', { wcUpdates: true }, true, true],
  ['updates on, updater missing', { wcUpdates: true }, false, false],
];

for (const packAsar of [true, false]) {
  for (const [name, pkg, withUpdater, ok] of cases) {
    test(`checkUpdater (${packAsar ? 'app.asar' : 'app folder'}): ${name}`, async () => {
      const { root, resources } = await makeResources({ name: 'x', main: 'src/main.js', ...pkg }, withUpdater, { packAsar });
      try {
        if (ok) {
          const r = checkUpdater(resources);
          assert.strictEqual(r.updates, pkg.wcUpdates === true);
          assert.strictEqual(r.hasUpdater, withUpdater);
        } else {
          assert.throws(() => checkUpdater(resources), /electron-updater/);
        }
      } finally {
        asar.uncacheAll();
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
}
