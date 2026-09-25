// Unit tests for src/locale-prefs.js: the first-run 12/24-hour choice follows the Windows Region format.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { prefers12h } = require('../../src/locale-prefs');

test('12-hour regions: en-US, es-MX, en-AU, en-IN', () => {
  for (const l of ['en-US', 'es-MX', 'en-AU', 'en-IN']) assert.equal(prefers12h(l), true, l);
});

test('24-hour regions: en-GB, pt-BR, ja-JP, de-DE', () => {
  for (const l of ['en-GB', 'pt-BR', 'ja-JP', 'de-DE']) assert.equal(prefers12h(l), false, l);
});

test('empty, missing or unknown locale: 24-hour (never the process default)', () => {
  for (const l of ['', '   ', undefined, null, 42, 'xx-garbage', 'not a locale']) assert.equal(prefers12h(l), false, String(l));
});
