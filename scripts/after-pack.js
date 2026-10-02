// electron-builder afterPack hook: flips Electron fuses in the packaged binary before it is signed or wrapped in an
// installer (NSIS, portable, appx all build from this unpacked folder). Fuses are compiled-in switches that turn off
// features an installed desktop app never needs, so they cannot be re-enabled by command-line flags or environment variables.
// https://www.electronjs.org/docs/latest/tutorial/fuses
const fs = require('fs');
const path = require('path');

// Chromium files the app never loads: the WebGPU shader compilers (DXC) and the SwiftShader Vulkan software
// renderer with its loader. The page draws with DOM, CSS and a 2D canvas (no WebGL or WebGPU), which use ANGLE on
// D3D11 (d3dcompiler_47.dll, kept) or Skia's software path when the GPU is off. About 33 MB less on disk.
const UNUSED_WIN_FILES = ['dxcompiler.dll', 'dxil.dll', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll'];

// Auto-update needs electron-updater inside the app. electron-builder packs only dependencies, so if it ever moves
// back to devDependencies, a build that turns updates on (build.extraMetadata.wcUpdates: true) would ship an app that
// never updates. Fail that build here instead. Reads the package.json and the module list the app actually ships
// (app.asar, or the app folder when asar is off). Returns what it found.
function checkUpdater(resourcesDir) {
  const asarPath = path.join(resourcesDir, 'app.asar');
  let pkg, hasUpdater;
  if (fs.existsSync(asarPath)) {
    const asar = require('@electron/asar');
    pkg = JSON.parse(asar.extractFile(asarPath, 'package.json').toString('utf8'));
    try { hasUpdater = !!asar.statFile(asarPath, path.join('node_modules', 'electron-updater', 'package.json')); } catch { hasUpdater = false; }
  } else {
    const appDir = path.join(resourcesDir, 'app');
    pkg = JSON.parse(fs.readFileSync(path.join(appDir, 'package.json'), 'utf8'));
    hasUpdater = fs.existsSync(path.join(appDir, 'node_modules', 'electron-updater', 'package.json'));
  }
  const updates = pkg.wcUpdates === true;
  if (updates && !hasUpdater) {
    throw new Error('wcUpdates is true but electron-updater is not in the packaged app, so this build would never update. '
      + 'Move electron-updater from devDependencies to dependencies in package.json (npm install --save electron-updater) and build again.');
  }
  return { updates, hasUpdater };
}

// Updates may only be on in a signed website build: an unsigned app must never download and run installers, and the
// Store build is updated by the Store. scripts/dist-release.js turns wcUpdates on together with the signing options;
// this stops any other route to wcUpdates: true (package.json edited by hand, -c.extraMetadata.wcUpdates=true, or
// `npm run dist:all` with updates on). `winOptions` is the merged win config, `targets` the target names being built.
function checkUpdateBuild({ updates, targets = [], winOptions = {}, env = {} }) {
  if (!updates) return;
  if (targets.some((t) => /^appx$/i.test(t))) {
    throw new Error('wcUpdates is true in a build with a Store package (appx). The Store updates the Store build; build the '
      + 'Store packages with `npm run dist:store`, which keeps updates off.');
  }
  const sign = winOptions.signtoolOptions || {};
  const signed = !!(winOptions.azureSignOptions || sign.certificateSha1 || sign.certificateSubjectName || sign.certificateFile
    || sign.sign || env.CSC_LINK || env.WIN_CSC_LINK);
  if (!signed) {
    throw new Error('wcUpdates is true but this build is not code-signed. Updates stay off in unsigned builds; build with '
      + 'signing configured (scripts/dist-release.js and the variables in scripts/signing.js).');
  }
}

module.exports = async function afterPack(context) {
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  const platform = context.electronPlatformName;
  const name = context.packager.appInfo.productFilename;
  const exe = platform === 'darwin'
    ? path.join(context.appOutDir, `${name}.app`)
    : path.join(context.appOutDir, platform === 'win32' ? `${name}.exe` : context.packager.executableName);

  const resourcesDir = platform === 'darwin' ? path.join(exe, 'Contents', 'Resources') : path.join(context.appOutDir, 'resources');
  const upd = checkUpdater(resourcesDir);
  if (platform === 'win32') {
    checkUpdateBuild({
      updates: upd.updates,
      targets: (context.targets || []).map((t) => t.name),
      winOptions: context.packager.platformSpecificBuildOptions || {},
      env: process.env,
    });
  }
  console.log(`  • auto-update  ${upd.updates ? 'on (electron-updater packaged, signed build)' : 'off'}`);

  if (platform === 'win32') {
    for (const f of UNUSED_WIN_FILES) fs.rmSync(path.join(context.appOutDir, f), { force: true });
    console.log(`  • removed unused Chromium files  ${UNUSED_WIN_FILES.join(', ')}`);
  }

  await flipFuses(exe, {
    version: FuseVersion.V1,
    resetAdHocDarwinSignature: platform === 'darwin' && context.arch === 3, // arm64 macOS needs a valid ad hoc signature
    [FuseV1Options.RunAsNode]: false, // ELECTRON_RUN_AS_NODE cannot turn the app into a Node.js runtime
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // NODE_OPTIONS is ignored
    [FuseV1Options.EnableNodeCliInspectArguments]: false, // --inspect and friends are ignored
    [FuseV1Options.EnableCookieEncryption]: true, // cookies on disk encrypted with the OS keystore
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true, // app.asar must match the hash electron-builder embeds
    [FuseV1Options.OnlyLoadAppFromAsar]: true, // never load an app folder placed next to app.asar
    // No extra privileges for file:// pages: the renderer is served from the custom scheme app://owc (main.js
    // protocol.handle, which reads the files from app.asar with net.fetch), so no page is ever loaded from file://.
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  });
  console.log(`  • electron fuses flipped  file=${path.basename(exe)}`);
};
module.exports.checkUpdater = checkUpdater;
module.exports.checkUpdateBuild = checkUpdateBuild;
