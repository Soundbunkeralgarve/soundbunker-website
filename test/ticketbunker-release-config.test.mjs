import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveSubmitProfile, validateReleaseConfig } from '../scripts/check-ticketbunker-release.mjs';

const APPS = [
  ['theticketbunker', '6837950372', 'pt.soundbunker.theticketbunker', '0027b9f4-e08e-4887-93b6-44f7bc8552b7'],
  ['theticketbunker-organiser', '6837950804', 'pt.soundbunker.theticketbunker.organiser', 'c3c754ba-b9e9-4b76-a679-88c310f87d7e'],
];
function config(entry = APPS[0]) {
  const [directory, appleId, bundleId, projectId] = entry;
  return {
    app: JSON.parse(readFileSync(new URL(`../${directory}/app.json`, import.meta.url))).expo,
    eas: JSON.parse(readFileSync(new URL(`../${directory}/eas.json`, import.meta.url))),
    expected: { appleId, bundleId, projectId },
  };
}

for (const entry of APPS) {
  test(`${entry[0]} supports saved Expo credentials without CI environment values`, () => {
    const { app, eas, expected } = config(entry);
    assert.doesNotThrow(() => validateReleaseConfig(app, eas, expected));
    const profile = resolveSubmitProfile(eas.submit, 'production');
    assert.deepEqual(profile.ios, { ascAppId: expected.appleId });
    assert.equal(profile.android.track, 'internal');
  });
  test(`${entry[0]} CI inherits its own store identity and internal track`, () => {
    const { eas, expected } = config(entry);
    const profile = resolveSubmitProfile(eas.submit, 'production-ci');
    assert.equal(profile.ios.ascAppId, expected.appleId);
    assert.notEqual(profile.ios.ascAppId, '6823316315');
    assert.equal(profile.android.track, 'internal');
    assert.equal(profile.ios.ascApiKeyPath, '$EXPO_ASC_API_KEY_PATH');
    assert.equal(profile.ios.ascApiKeyId, '$EXPO_ASC_KEY_ID');
    assert.equal(profile.ios.ascApiKeyIssuerId, '$EXPO_ASC_ISSUER_ID');
  });
}

test('fails before a build when any submit profile targets Scanner or the other app', () => {
  for (const id of ['6823316315', APPS[1][1]]) {
    const { app, eas, expected } = config();
    eas.submit['production-ci'].ios.ascAppId = id;
    assert.throws(() => validateReleaseConfig(app, eas, expected), /another app/);
  }
});

test('fails before a build when an inherited submit profile could publish Android publicly', () => {
  const { app, eas, expected } = config();
  eas.submit['production-ci'].android = { track: 'production' };
  assert.throws(() => validateReleaseConfig(app, eas, expected), /public Play track/);
});

test('rejects a standard submit route that depends on a GitHub runner key file', () => {
  const { app, eas, expected } = config();
  eas.submit.production.ios.ascApiKeyPath = '$EXPO_ASC_API_KEY_PATH';
  assert.throws(() => validateReleaseConfig(app, eas, expected), /Expo-managed credentials/);
});

test('rejects a CI route that loses the private runner credential configuration', () => {
  const { app, eas, expected } = config();
  delete eas.submit['production-ci'].ios.ascApiKeyIssuerId;
  assert.throws(() => validateReleaseConfig(app, eas, expected), /existing private runner key/);
});

test('rejects another Expo project or missing expected identity', () => {
  const { app, eas, expected } = config();
  app.extra.eas.projectId = APPS[1][3];
  assert.throws(() => validateReleaseConfig(app, eas, expected), /Expo project/);
  assert.throws(() => validateReleaseConfig(app, eas, {}), /explicit app identity/);
});

test('rejects missing and circular submission profiles', () => {
  assert.throws(() => resolveSubmitProfile({}, 'production'), /Missing submit profile/);
  assert.throws(() => resolveSubmitProfile({ a: { extends: 'b' }, b: { extends: 'a' } }, 'a'), /inheritance/);
});
