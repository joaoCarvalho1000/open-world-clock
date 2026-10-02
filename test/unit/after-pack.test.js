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

// checkUpdateBuild: updates may only be on in a signed build with no Store (appx) target.
const { checkUpdateBuild } = require('../../scripts/after-pack.js');
const azure = { azureSignOptions: { endpoint: 'https://eus.codesigning.azure.net', codeSigningAccountName: 'a', certificateProfileName: 'p', publisherName: 'X' } };
const updateBuildCases = [
  ['updates off, unsigned (the default build)', { updates: false, targets: ['nsis', 'portable'] }, true],
  ['updates off, Store build', { updates: false, targets: ['appx'] }, true],
  ['updates on, Azure signed, nsis + portable', { updates: true, targets: ['nsis', 'portable'], winOptions: azure }, true],
  ['updates on, certificate thumbprint', { updates: true, targets: ['nsis'], winOptions: { signtoolOptions: { certificateSha1: 'AB' } } }, true],
  ['updates on, CSC_LINK certificate file', { updates: true, targets: ['nsis'], env: { CSC_LINK: 'cert.pfx' } }, true],
  ['updates on, unsigned', { updates: true, targets: ['nsis', 'portable'] }, /not code-signed/],
  ['updates on, signtoolOptions without a certificate', { updates: true, targets: ['nsis'], winOptions: { signtoolOptions: { publisherName: 'X' } } }, /not code-signed/],
  ['updates on, signed, with an appx target', { updates: true, targets: ['nsis', 'appx'], winOptions: azure }, /appx/],
];
for (const [name, args, expect] of updateBuildCases) {
  test(`checkUpdateBuild: ${name}`, () => {
    if (expect === true) assert.doesNotThrow(() => checkUpdateBuild(args));
    else assert.throws(() => checkUpdateBuild(args), expect);
  });
}
