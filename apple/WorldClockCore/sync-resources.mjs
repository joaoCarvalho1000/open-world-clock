#!/usr/bin/env node
// Copies the JS-generated shared data into the Swift package resources (copies, not symlinks, so SwiftPM and
// Xcode behave the same on every OS). Regenerate everything with:
//   node scripts/export-shared.mjs && node apple/WorldClockCore/sync-resources.mjs
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const shared = join(here, '..', '..', 'shared');
const jobs = [
  ['zones.json', join(here, 'Sources', 'WorldClockCore', 'Resources')],
  ['world-land.json', join(here, 'Sources', 'WorldClockCore', 'Resources')],
  ['golden.json', join(here, 'Tests', 'WorldClockCoreTests', 'Resources')],
];
let failed = false;
for (const [name, destDir] of jobs) {
  const src = join(shared, name);
  if (!existsSync(src)) { console.error(`missing ${src} (run node scripts/export-shared.mjs first)`); failed = true; continue; }
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, join(destDir, name));
  console.log(`copied ${name} -> ${destDir}`);
}
process.exit(failed ? 1 : 0);
