import { readFileSync } from 'node:fs';

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const { EXPECTED_APPLE_ID, EXPECTED_BUNDLE_ID, EXPECTED_PROJECT_ID } = process.env;
if (![EXPECTED_APPLE_ID, EXPECTED_BUNDLE_ID, EXPECTED_PROJECT_ID].every(Boolean)) {
  throw new Error('An explicit app identity is required before starting a store build.');
}
if (app.ios.bundleIdentifier !== EXPECTED_BUNDLE_ID || app.android.package !== EXPECTED_BUNDLE_ID ||
    app.extra.eas.projectId !== EXPECTED_PROJECT_ID || eas.submit.production.ios.ascAppId !== EXPECTED_APPLE_ID ||
    EXPECTED_APPLE_ID === '6823316315') {
  throw new Error('Store app, package or Expo project does not match this release.');
}
if (app.version !== '1.0.0' || eas.submit.production.android.track !== 'internal') {
  throw new Error('Initial release must use version 1.0.0 and the Play internal testing track.');
}
console.log(`${app.name}: release identity verified; ${app.version}; iOS and Android.`);
