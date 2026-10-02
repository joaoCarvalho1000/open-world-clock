// scripts/signing.js: the website build signs only when signing variables are set, and then always turns auto-update
// on with a publisher name for the updater to check. With no variables the build stays unsigned with updates off.
const test = require('node:test');
const assert = require('node:assert');
const { signingConfig } = require('../../scripts/signing.js');

const AZURE = {
  AZURE_SIGNING_ENDPOINT: 'https://eus.codesigning.azure.net',
  AZURE_SIGNING_ACCOUNT: 'owcsigning',
  AZURE_SIGNING_PROFILE: 'owc-public',
  AZURE_TENANT_ID: '00000000-0000-0000-0000-000000000001',
  AZURE_CLIENT_ID: '00000000-0000-0000-0000-000000000002',
  AZURE_CLIENT_SECRET: 'not-a-real-secret',
  WIN_PUBLISHER_NAME: 'Example Publisher',
};
const THUMB = 'ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12';

test('no variables: unsigned, nothing merged', () => {
  assert.strictEqual(signingConfig({}), null);
});

test('blank variables count as unset', () => {
  assert.strictEqual(signingConfig({ AZURE_SIGNING_ENDPOINT: '  ', WIN_SIGN_CERT_SHA1: '', WIN_PUBLISHER_NAME: 'X' }), null);
});

test('Azure credentials alone (common for other tools) do not switch signing on', () => {
  const { AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET } = AZURE;
  assert.strictEqual(signingConfig({ AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET }), null);
});

test('Azure Artifact Signing: azureSignOptions, forced signing, updates on', () => {
  const r = signingConfig(AZURE);
  assert.strictEqual(r.method, 'azure');
  assert.deepStrictEqual(r.config.win.azureSignOptions, {
    endpoint: 'https://eus.codesigning.azure.net',
    codeSigningAccountName: 'owcsigning',
    certificateProfileName: 'owc-public',
    publisherName: 'Example Publisher',
  });
  assert.strictEqual(r.config.forceCodeSigning, true);
  assert.deepStrictEqual(r.config.extraMetadata, { wcUpdates: true });
  assert.strictEqual(r.config.win.signtoolOptions, undefined);
  // The secret is read by the TrustedSigning module from the environment and never lands in the build config.
  assert.ok(!JSON.stringify(r.config).includes(AZURE.AZURE_CLIENT_SECRET));
});

test('Azure: a missing variable names what is missing', () => {
  const env = { ...AZURE };
  delete env.AZURE_CLIENT_SECRET;
  delete env.AZURE_SIGNING_PROFILE;
  assert.throws(() => signingConfig(env), /AZURE_SIGNING_PROFILE, AZURE_CLIENT_SECRET/);
});

test('Azure: endpoint must be a codesigning.azure.net region URL', () => {
  assert.throws(() => signingConfig({ ...AZURE, AZURE_SIGNING_ENDPOINT: 'https://example.com' }), /AZURE_SIGNING_ENDPOINT/);
  assert.throws(() => signingConfig({ ...AZURE, AZURE_SIGNING_ENDPOINT: 'http://eus.codesigning.azure.net' }), /AZURE_SIGNING_ENDPOINT/);
});

test('certificate thumbprint: signtoolOptions, normalised to upper case without spaces', () => {
  const r = signingConfig({ WIN_SIGN_CERT_SHA1: THUMB.replace(/(.{8})/g, '$1 '), WIN_PUBLISHER_NAME: 'Open Source Developer, Jane Doe' });
  assert.strictEqual(r.method, 'certificate');
  assert.deepStrictEqual(r.config.win.signtoolOptions, { certificateSha1: THUMB.toUpperCase(), publisherName: 'Open Source Developer, Jane Doe' });
  assert.deepStrictEqual(r.config.extraMetadata, { wcUpdates: true });
  assert.strictEqual(r.config.forceCodeSigning, true);
});

test('certificate thumbprint must be 40 hex digits', () => {
  assert.throws(() => signingConfig({ WIN_SIGN_CERT_SHA1: 'abc', WIN_PUBLISHER_NAME: 'X' }), /40 hex/);
});

test('signing without a publisher name is refused (the updater could not check the signer)', () => {
  const env = { ...AZURE, WIN_PUBLISHER_NAME: ' ' };
  assert.throws(() => signingConfig(env), /WIN_PUBLISHER_NAME/);
  assert.throws(() => signingConfig({ WIN_SIGN_CERT_SHA1: THUMB }), /WIN_PUBLISHER_NAME/);
});

test('both ways at once is refused', () => {
  assert.throws(() => signingConfig({ ...AZURE, WIN_SIGN_CERT_SHA1: THUMB }), /Pick one/);
});
