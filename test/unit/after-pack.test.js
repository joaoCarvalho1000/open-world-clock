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
  ['updates on, Azure signed, nsis + portable', { updates: true, forceCodeSigning: true, targets: ['nsis', 'portable'], winOptions: azure }, true],
  ['updates on, certificate thumbprint with its publisher (scripts/signing.js)', { updates: true, forceCodeSigning: true, targets: ['nsis'], winOptions: { signtoolOptions: { certificateSha1: 'AB', publisherName: 'X' } } }, true],
  // SEC-2: signing config alone is not proof the updater will check the publisher
  ['updates on, certificate thumbprint without a publisher', { updates: true, forceCodeSigning: true, targets: ['nsis'], winOptions: { signtoolOptions: { certificateSha1: 'AB' } } }, /no publisher name/],
  ['updates on, CSC_LINK certificate file without a publisher', { updates: true, forceCodeSigning: true, targets: ['nsis'], env: { CSC_LINK: 'cert.pfx' } }, /no publisher name/],
  ['updates on, Azure without a publisher', { updates: true, forceCodeSigning: true, targets: ['nsis'], winOptions: { azureSignOptions: { ...azure.azureSignOptions, publisherName: undefined } } }, /no publisher name/],
  ['updates on, null publisher', { updates: true, forceCodeSigning: true, targets: ['nsis'], winOptions: { azureSignOptions: { ...azure.azureSignOptions, publisherName: null } } }, /no publisher name/],
  ['updates on, empty publisher', { updates: true, forceCodeSigning: true, targets: ['nsis'], winOptions: { azureSignOptions: { ...azure.azureSignOptions, publisherName: '  ' } } }, /no publisher name/],
  ['updates on, empty publisher list', { updates: true, forceCodeSigning: true, targets: ['nsis'], winOptions: { signtoolOptions: { certificateSha1: 'AB', publisherName: [] } } }, /no publisher name/],
  ['updates on, custom sign function without a publisher', { updates: true, forceCodeSigning: true, targets: ['nsis'], winOptions: { signtoolOptions: { sign: 'scripts/x.js' } } }, /no publisher name/],
  ['updates on, verification turned off', { updates: true, forceCodeSigning: true, targets: ['nsis'], winOptions: { ...azure, verifyUpdateCodeSignature: false } }, /verifyUpdateCodeSignature/],
  ['updates on, unsigned', { updates: true, forceCodeSigning: true, targets: ['nsis', 'portable'] }, /not code-signed/],
  ['updates on, signtoolOptions without a certificate', { updates: true, forceCodeSigning: true, targets: ['nsis'], winOptions: { signtoolOptions: { publisherName: 'X' } } }, /not code-signed/],
  ['updates on, signed, with an appx target', { updates: true, forceCodeSigning: true, targets: ['nsis', 'appx'], winOptions: azure }, /appx/],
  ['updates on, signed, forceCodeSigning off', { updates: true, targets: ['nsis'], winOptions: azure }, /forceCodeSigning/],
  ['updates on, signAndEditExecutable false', { updates: true, forceCodeSigning: true, targets: ['nsis'], winOptions: { ...azure, signAndEditExecutable: false } }, /signAndEditExecutable/],
  ['updates on, signExecutable false', { updates: true, forceCodeSigning: true, targets: ['nsis'], winOptions: { ...azure, signExecutable: false } }, /signExecutable/],
];
for (const [name, args, expect] of updateBuildCases) {
  test(`checkUpdateBuild: ${name}`, () => {
    if (expect === true) assert.doesNotThrow(() => checkUpdateBuild(args));
    else assert.throws(() => checkUpdateBuild(args), expect);
  });
}

// afterSign: the emitted app-update.yml of an update build must name our feed and the configured publisher.
const { checkEmittedUpdateConfig } = require('../../scripts/after-sign.js');
const goodYml = 'provider: generic\nurl: https://download.openworldclock.com\npublisherName:\n  - X\nupdaterCacheDirName: open-world-clock-updater\n';
const emittedCases = [
  ['updates off: nothing checked', { updates: false, ymlText: null }, null],
  ['the expected feed and publisher', { updates: true, ymlText: goodYml, winOptions: azure }, ['X']],
  ['missing file', { updates: true, ymlText: null, winOptions: azure }, /no resources\/app-update.yml/],
  ['no publisherName', { updates: true, ymlText: 'provider: generic\nurl: https://download.openworldclock.com\n', winOptions: azure }, /publisherName is missing/],
  ['publisherName null', { updates: true, ymlText: goodYml.replace(/publisherName:\n {2}- X/, 'publisherName: null'), winOptions: azure }, /publisherName is missing/],
  ['publisherName []', { updates: true, ymlText: goodYml.replace(/publisherName:\n {2}- X/, 'publisherName: []'), winOptions: azure }, /publisherName is missing/],
  ['another publisher', { updates: true, ymlText: goodYml.replace('- X', '- Someone Else'), winOptions: azure }, /not the expected/],
  ['another feed', { updates: true, ymlText: goodYml.replace('download.openworldclock.com', 'evil.example'), winOptions: azure }, /url is/],
  ['another provider', { updates: true, ymlText: goodYml.replace('generic', 'github'), winOptions: azure }, /provider is/],
  ['not YAML', { updates: true, ymlText: 'a: [', winOptions: azure }, /does not parse/],
  ['no configured publisher to compare with', { updates: true, ymlText: goodYml, winOptions: {} }, /no publisher name is configured/],
];
for (const [name, args, expect] of emittedCases) {
  test(`afterSign app-update.yml: ${name}`, () => {
    if (expect === null || Array.isArray(expect)) assert.deepEqual(checkEmittedUpdateConfig(args), expect);
    else assert.throws(() => checkEmittedUpdateConfig(args), expect);
  });
}
