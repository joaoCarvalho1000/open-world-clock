// electron-builder afterPack hook: flips Electron fuses in the packaged binary before it is signed or wrapped in an
// installer (NSIS, portable, appx all build from this unpacked folder). Fuses are compiled-in switches that turn off
// features an installed widget never needs, so they cannot be re-enabled by command-line flags or environment variables.
// https://www.electronjs.org/docs/latest/tutorial/fuses
const fs = require('fs');
const path = require('path');

// Chromium files a clock widget never loads: the WebGPU shader compilers (DXC) and the SwiftShader Vulkan software
// renderer with its loader. The page draws with DOM, CSS and a 2D canvas (no WebGL or WebGPU), which use ANGLE on
// D3D11 (d3dcompiler_47.dll, kept) or Skia's software path when the GPU is off. About 33 MB less on disk.
const UNUSED_WIN_FILES = ['dxcompiler.dll', 'dxil.dll', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll'];

// Auto-update needs electron-updater inside the app, but it is a devDependency (electron-builder packs only
// dependencies), so a build that turns updates on (build.extraMetadata.wcUpdates: true) without moving it to
// dependencies would ship an app that never updates. Fail that build here instead. Reads the package.json and the
// module list the app actually ships (app.asar, or the app folder when asar is off). Returns what it found.
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

module.exports = async function afterPack(context) {
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  const platform = context.electronPlatformName;
  const name = context.packager.appInfo.productFilename;
  const exe = platform === 'darwin'
    ? path.join(context.appOutDir, `${name}.app`)
    : path.join(context.appOutDir, platform === 'win32' ? `${name}.exe` : context.packager.executableName);

  const resourcesDir = platform === 'darwin' ? path.join(exe, 'Contents', 'Resources') : path.join(context.appOutDir, 'resources');
  const upd = checkUpdater(resourcesDir);
  console.log(`  • auto-update  ${upd.updates ? 'on (electron-updater packaged)' : 'off'}`);

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
