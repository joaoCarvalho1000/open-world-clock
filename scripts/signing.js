// Code signing for the website builds (installer and portable exe), read from environment variables so the same
// command builds signed in the release workflow (repository secrets) and unsigned on a PC without them.
// scripts/dist-release.js merges the returned config over package.json "build"; PUBLISHING.md, "Code signing for the
// website build", has the setup. Returns null when nothing is configured: an unsigned build with auto-update off,
// exactly like `npm run dist`.
//
// Two ways to sign, never both:
// - Azure Artifact Signing (formerly Trusted Signing), through electron-builder's win.azureSignOptions:
//   AZURE_SIGNING_ENDPOINT, AZURE_SIGNING_ACCOUNT, AZURE_SIGNING_PROFILE (the account's region endpoint, account name
//   and certificate profile name) plus the service principal AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET,
//   which the TrustedSigning PowerShell module reads itself. Only the three AZURE_SIGNING_* names switch this on: the
//   AZURE_TENANT_ID family is common for other Azure tools, and on its own it must not turn a local build into a
//   failed signing attempt.
// - A certificate in the Windows certificate store (a cloud HSM such as Certum SimplySign or SSL.com eSigner, or a
//   USB token), through win.signtoolOptions: WIN_SIGN_CERT_SHA1, the certificate's SHA-1 thumbprint.
//
// Both need WIN_PUBLISHER_NAME: the certificate subject, either its CN exactly as Windows shows it ("Issued to") or
// the full subject DN. It goes into app-update.yml, and electron-updater refuses an update whose installer is not
// signed by that name. Without it the updater would check only the sha512 in latest.yml, so a signed build without
// it is refused here.
//
// A signed build turns auto-update on (extraMetadata.wcUpdates), since the updater needs a signature to trust. The app
// still checks for updates only in the NSIS install: src/main.js skips the portable exe (PORTABLE_EXECUTABLE_FILE) and
// the Store build (process.windowsStore), and scripts/after-pack.js stops a build that has updates on together with a
// Store (appx) target or without signing.

const AZURE_SWITCH = ['AZURE_SIGNING_ENDPOINT', 'AZURE_SIGNING_ACCOUNT', 'AZURE_SIGNING_PROFILE'];
const AZURE_CREDENTIALS = ['AZURE_TENANT_ID', 'AZURE_CLIENT_ID', 'AZURE_CLIENT_SECRET'];

function signingConfig(env = process.env) {
  const val = (k) => (typeof env[k] === 'string' ? env[k].trim() : '');
  const azureOn = AZURE_SWITCH.some((k) => val(k));
  const sha1 = val('WIN_SIGN_CERT_SHA1').replace(/[\s:]+/g, '');
  const publisherName = val('WIN_PUBLISHER_NAME');

  if (!azureOn && !sha1) return null;
  if (azureOn && sha1) {
    throw new Error('Both Azure Artifact Signing (AZURE_SIGNING_*) and WIN_SIGN_CERT_SHA1 are set. Pick one way to sign.');
  }
  if (!publisherName) {
    throw new Error('Signing is configured but WIN_PUBLISHER_NAME is empty. Set it to the certificate subject CN, exactly as '
      + 'Windows shows it under Digital Signatures, so the updater can check who signed each update.');
  }

  const common = {
    forceCodeSigning: true, // a file that did not get signed fails the build instead of shipping unsigned
    extraMetadata: { wcUpdates: true },
  };

  if (azureOn) {
    const missing = [...AZURE_SWITCH, ...AZURE_CREDENTIALS].filter((k) => !val(k));
    if (missing.length) {
      throw new Error(`Azure Artifact Signing is partly configured. Missing: ${missing.join(', ')}.`);
    }
    const endpoint = val('AZURE_SIGNING_ENDPOINT');
    if (!/^https:\/\/[a-z0-9-]+\.codesigning\.azure\.net\/?$/i.test(endpoint)) {
      throw new Error(`AZURE_SIGNING_ENDPOINT should look like https://eus.codesigning.azure.net (the account's region), not ${endpoint}.`);
    }
    return {
      method: 'azure',
      publisherName,
      config: {
        ...common,
        win: {
          azureSignOptions: {
            endpoint,
            codeSigningAccountName: val('AZURE_SIGNING_ACCOUNT'),
            certificateProfileName: val('AZURE_SIGNING_PROFILE'),
            publisherName,
          },
        },
      },
    };
  }

  if (!/^[0-9a-f]{40}$/i.test(sha1)) {
    throw new Error('WIN_SIGN_CERT_SHA1 should be the 40 hex digit SHA-1 thumbprint of the signing certificate.');
  }
  return {
    method: 'certificate',
    publisherName,
    config: {
      ...common,
      win: {
        signtoolOptions: {
          certificateSha1: sha1.toUpperCase(),
          publisherName,
        },
      },
    },
  };
}

module.exports = { signingConfig, AZURE_SWITCH, AZURE_CREDENTIALS };
