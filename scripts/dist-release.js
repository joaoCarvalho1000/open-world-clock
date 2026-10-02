// Builds the website downloads (portable:x64 and nsis:x64, the same targets as `npm run dist`) and signs them when
// signing is configured in the environment (scripts/signing.js). The release workflow runs this; on a PC without the
// variables it builds unsigned, with auto-update off, exactly like `npm run dist`. Never builds the Store packages:
// the Store signs those itself and they never self-update.
//
//   node scripts/dist-release.js [--out <dir>]     (--out: build somewhere other than dist/, for a trial run)
const path = require('path');
const { build, Platform, Arch } = require('electron-builder');
const { signingConfig } = require('./signing.js');

async function main() {
  const args = process.argv.slice(2);
  const outIdx = args.indexOf('--out');
  const out = outIdx >= 0 ? args[outIdx + 1] : null;
  if (outIdx >= 0 && !out) throw new Error('--out needs a folder.');

  const signing = signingConfig(process.env);
  console.log(signing
    ? `  • signing  ${signing.method}, publisher ${signing.publisherName}; auto-update on (installer only)`
    : '  • signing  none: unsigned build, auto-update off');

  const config = { ...(signing ? signing.config : {}) };
  if (out) config.directories = { output: path.resolve(out) };

  await build({
    targets: Platform.WINDOWS.createTarget(['portable', 'nsis'], Arch.x64),
    config: Object.keys(config).length ? config : undefined,
    publish: 'never',
  });
}

main().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
