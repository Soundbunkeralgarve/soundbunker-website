import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const CI_IOS_KEY_FIELDS = Object.freeze({
  ascApiKeyPath: '$EXPO_ASC_API_KEY_PATH',
  ascApiKeyId: '$EXPO_ASC_KEY_ID',
  ascApiKeyIssuerId: '$EXPO_ASC_ISSUER_ID',
});

export function resolveSubmitProfile(profiles, name, visited = []) {
  if (visited.includes(name) || visited.length > 5) throw new Error('Invalid submit profile inheritance.');
  const profile = profiles?.[name];
  if (!profile) throw new Error(`Missing submit profile: ${name}`);
  const parent = profile.extends ? resolveSubmitProfile(profiles, profile.extends, [...visited, name]) : {};
  const resolved = { ...parent, ...profile };
  for (const platform of ['ios', 'android']) {
    if (parent[platform] || profile[platform]) resolved[platform] = { ...parent[platform], ...profile[platform] };
  }
  return resolved;
}

export function validateReleaseConfig(app, eas, expected) {
  const { appleId, bundleId, projectId } = expected;
  if (![appleId, bundleId, projectId].every(Boolean)) {
    throw new Error('An explicit app identity is required before starting a store build.');
  }
  if (app.ios?.bundleIdentifier !== bundleId || app.android?.package !== bundleId ||
      app.extra?.eas?.projectId !== projectId || appleId === '6823316315') {
    throw new Error('Store app, package or Expo project does not match this release.');
  }
  for (const name of Object.keys(eas.submit || {})) {
    const profile = resolveSubmitProfile(eas.submit, name);
    if (profile.ios?.ascAppId !== appleId || (profile.android && profile.android.track !== 'internal')) {
      throw new Error(`Submit profile ${name} points at another app or a public Play track.`);
    }
  }
  const production = resolveSubmitProfile(eas.submit, 'production');
  const ci = resolveSubmitProfile(eas.submit, 'production-ci');
  if (typeof app.version !== 'string' || app.version !== app.version.trim() || !/^[1-9]\d*\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(app.version)) {
    throw new Error('Store releases require a stable version in X.Y.Z format, at least 1.0.0.');
  }
  if (production.android?.track !== 'internal' || ci.android?.track !== 'internal') {
    throw new Error('Store releases must use the Play internal testing track.');
  }
  if (Object.keys(CI_IOS_KEY_FIELDS).some(field => field in production.ios)) {
    throw new Error('The standard production submit profile must use Expo-managed credentials, not a CI file path.');
  }
  if (eas.submit['production-ci'].extends !== 'production' ||
      Object.entries(CI_IOS_KEY_FIELDS).some(([field, value]) => ci.ios[field] !== value)) {
    throw new Error('The CI submit profile must inherit the app identity and use the existing private runner key.');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
  const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
  validateReleaseConfig(app, eas, {
    appleId: process.env.EXPECTED_APPLE_ID,
    bundleId: process.env.EXPECTED_BUNDLE_ID,
    projectId: process.env.EXPECTED_PROJECT_ID,
  });
  console.log(`${app.name}: release identity and saved/CI submission routes verified; ${app.version}; iOS and Android.`);
}
