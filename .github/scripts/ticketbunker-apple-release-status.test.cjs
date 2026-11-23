'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { APPS, apiUrl, createAppleClient, collection, inspectApp, inspectAll } = require('./ticketbunker-apple-release-status.cjs');

function mockClient(app = APPS[0], overrides = {}) {
  const calls = [];
  const get = async (input, version = 'v1') => {
    const url = apiUrl(input, version), path = url.pathname;
    calls.push(path);
    if (overrides[path]) return overrides[path](url);
    if (path === `/v1/apps/${app.id}`) return { data: { id: app.id, attributes: { bundleId: app.bundleId, name: app.name } } };
    if (path.endsWith('/appStoreVersions')) return { data: [{ id: 'version-old', attributes: { platform: 'IOS', versionString: '1.0.0', appStoreState: 'READY_FOR_SALE', createdDate: '2026-10-01' } }, { id: 'version-new', attributes: { platform: 'IOS', versionString: '1.0.1', appStoreState: 'WAITING_FOR_REVIEW', createdDate: '2026-11-20' } }] };
    if (path.endsWith('/builds')) return { data: [
      { id: 'newest-processing', attributes: { version: '16', processingState: 'PROCESSING', uploadedDate: '2026-11-23' } },
      { id: 'selected-15', attributes: { version: '15', processingState: 'VALID', uploadedDate: '2026-11-20', usesNonExemptEncryption: false } },
    ] };
    if (path.endsWith('/reviewSubmissions')) return { data: [
      { id: 'old-review', attributes: { platform: 'IOS', state: 'UNRESOLVED_ISSUES', submittedDate: '2026-11-12' } },
      { id: 'new-review', attributes: { platform: 'IOS', state: 'WAITING_FOR_REVIEW', submittedDate: '2026-11-20' } },
      { id: 'mac-review', attributes: { platform: 'MAC_OS', state: 'COMPLETE' } },
    ] };
    if (path === '/v1/appStoreVersions/version-new/relationships/build') return { data: { id: 'selected-15' } };
    if (path === '/v1/appStoreVersions/version-old/relationships/build') return { data: { id: 'older-than-latest-10' } };
    if (path === '/v1/builds/older-than-latest-10') return { data: { id: 'older-than-latest-10', attributes: { version: '7', processingState: 'VALID' } } };
    if (path.endsWith('/appAvailabilityV2')) return { data: { id: 'availability' } };
    if (path.endsWith('/territoryAvailabilities')) return { data: [{ attributes: { available: false }, relationships: { territory: { data: { id: 'FRA' } } } }] };
    if (path.endsWith('/appEncryptionDeclarations')) return { data: [] };
    throw new Error(`Unexpected fixture path ${path}`);
  };
  return { get, calls };
}

test('all three fixed Apple records match their independent bundle identifiers', () => {
  assert.deepEqual(APPS.map(a => [a.id, a.bundleId]), [
    ['6823316315', 'pt.soundbunker.ticketbunkerscanner'],
    ['6837950372', 'pt.soundbunker.theticketbunker'],
    ['6837950804', 'pt.soundbunker.theticketbunker.organiser'],
  ]);
});

test('reports the selected build separately from a newer processing build and current review separately from rejection history', async () => {
  const client = mockClient(), report = await inspectApp(client, APPS[0]);
  assert.equal(report.complete, true);
  assert.equal(report.storeVersions[0].versionString, '1.0.1');
  assert.equal(report.storeVersions[0].selectedBuild.buildNumber, '15');
  assert.equal(report.latestBuilds[0].buildNumber, '16');
  assert.equal(report.latestBuilds[0].processingState, 'PROCESSING');
  assert.equal(report.reviewSubmissions[0].id, 'new-review');
  assert.equal(report.reviewSubmissions.length, 2);
  assert.equal(report.storeVersions[1].selectedBuild.buildNumber, '7');
  assert.ok(client.calls.includes('/v1/builds/older-than-latest-10'));
  assert.deepEqual(report.availability, { franceSelected: false, territories: 1 });
});

test('a new app with no uploaded builds or reviews is complete information, not an approved release', async () => {
  const app = APPS[1];
  const client = mockClient(app, {
    '/v1/builds': () => ({ data: [] }),
    [`/v1/apps/${app.id}/reviewSubmissions`]: () => ({ data: [] }),
    '/v1/appStoreVersions/version-new/relationships/build': () => ({ data: null }),
    '/v1/appStoreVersions/version-old/relationships/build': () => ({ data: null }),
  });
  const report = await inspectApp(client, app);
  assert.equal(report.complete, true);
  assert.deepEqual(report.latestBuilds, []);
  assert.deepEqual(report.reviewSubmissions, []);
  assert.equal(report.storeVersions[0].selectedBuild, null);
  assert.equal(report.storeVersions[0].appStoreState, 'WAITING_FOR_REVIEW');
  assert.ok(!('availability' in report));
});

test('a wrong bundle identifier fails before any release records are read', async () => {
  const client = mockClient(APPS[0], {
    '/v1/apps/6823316315': () => ({ data: { id: '6823316315', attributes: { bundleId: APPS[1].bundleId } } }),
  });
  await assert.rejects(inspectApp(client, APPS[0]), /identity mismatch/);
  assert.deepEqual(client.calls, ['/v1/apps/6823316315']);
});

test('required API failures retain other apps and never fabricate approval', async () => {
  const fan = mockClient(APPS[1], {
    '/v1/builds': () => { throw new Error('Apple HTTP 403: FORBIDDEN'); },
  });
  const organiser = mockClient(APPS[2]);
  const client = { get: (path, version) => path.includes(APPS[2].id) ? organiser.get(path, version) : fan.get(path, version) };
  const report = await inspectAll(client, [APPS[1], APPS[2]]);
  assert.equal(report.complete, false);
  assert.equal(report.apps[0].complete, false);
  assert.deepEqual(report.apps[0].latestBuilds, []);
  assert.match(report.apps[0].errors[0], /latest builds: Apple HTTP 403: FORBIDDEN/);
  assert.equal(report.apps[1].complete, true);
  assert.equal(report.apps[1].storeVersions[0].selectedBuild.buildNumber, '15');
});

test('optional scanner declarations errors are visible without hiding core release status', async () => {
  const client = mockClient(APPS[0], { '/v1/apps/6823316315/appEncryptionDeclarations': () => { throw new Error('Apple HTTP 403: FORBIDDEN'); } });
  const report = await inspectApp(client, APPS[0]);
  assert.equal(report.complete, true);
  assert.equal(report.encryptionDeclarations, null);
  assert.match(report.warnings[0], /scanner encryption declarations/);
});

test('follows collection pagination but rejects off-site next links and loops', async () => {
  let count = 0;
  const client = { get: async () => ++count === 1 ? { data: [{ id: '1' }], links: { next: 'https://api.appstoreconnect.apple.com/v1/items?page=2' } } : { data: [{ id: '2' }] } };
  assert.deepEqual(await collection(client, 'items'), [{ id: '1' }, { id: '2' }]);
  let externalCalls = 0;
  await assert.rejects(collection({ get: async () => { externalCalls++; return { data: [], links: { next: 'https://example.invalid/v1/items' } }; } }, 'items'), /Unexpected Apple API URL/);
  assert.equal(externalCalls, 1);
  await assert.rejects(collection({ get: async () => ({ data: [], links: { next: 'https://api.appstoreconnect.apple.com/v1/items' } }) }, 'items'), /pagination loop/);
});

test('HTTP client performs GET only, does not follow redirects, and omits Apple free-text errors and credentials', async () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  let observed;
  const client = createAppleClient({ key: privateKey, kid: 'TEST', issuer: 'ISSUER', now: () => 1000000,
    fetchImpl: async (url, options) => {
      observed = { url, options };
      return { ok: false, status: 403, json: async () => ({ errors: [{ code: 'FORBIDDEN', detail: 'Never echo private account details' }] }) };
    },
  });
  await assert.rejects(client.get('apps/6823316315'), error => error.message === 'Apple HTTP 403: FORBIDDEN');
  assert.equal(observed.options.method, 'GET');
  assert.equal(observed.options.redirect, 'error');
  assert.match(observed.options.headers.Authorization, /^Bearer /);
  await assert.rejects(client.get('https://example.invalid/v1/apps'), /Unexpected Apple API URL/);
  assert.throws(() => createAppleClient({}), /credentials are required/);
});
