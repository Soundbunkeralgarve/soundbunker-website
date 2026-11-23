'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { apiUrl } = require('./ticketbunker-apple-release-status.cjs');
const { NEW_APPS, SAVED_SERIAL, metadataOnlyClient, inspectSigning } = require('./ticketbunker-signing-audit.cjs');

function mock(overrides = {}) {
  const calls = [];
  return {
    calls,
    async get(input, version) {
      const url = apiUrl(input, version), path = url.pathname;
      calls.push(url);
      if (overrides[path]) return overrides[path](url);
      if (path === '/v1/certificates' || path.endsWith('/certificates')) return { data: [{ id: 'CERT123', attributes: { serialNumber: SAVED_SERIAL, expirationDate: '2027-10-10', certificateContent: 'NEVER_PRINT_CERTIFICATE_CONTENT' } }] };
      if (path === '/v1/bundleIds') {
        const identifier = url.searchParams.get('filter[identifier]');
        const id = identifier.endsWith('.organiser') ? 'ORG123' : 'FAN123';
        return { data: [{ id, attributes: { identifier, seedId: 'NOT_NEEDED' } }] };
      }
      if (path.endsWith('/profiles')) return { data: [
        { id: 'PROFILE123', attributes: { name: 'App Store distribution profile', profileState: 'ACTIVE', profileType: 'IOS_APP_STORE', expirationDate: '2027-10-10', profileContent: 'NEVER_PRINT_PROFILE_CONTENT' } },
        { id: 'ADHOC123', attributes: { name: 'Ad hoc profile', profileState: 'ACTIVE', profileType: 'IOS_APP_ADHOC', profileContent: 'NEVER_PRINT_ADHOC_CONTENT' } },
      ] };
      throw new Error('Unexpected signing fixture request');
    },
  };
}

test('audit scopes reads to the two new apps and excludes scanner', () => {
  assert.deepEqual(NEW_APPS.map(app => app.id), ['6837950372', '6837950804']);
  assert.ok(NEW_APPS.every(app => !app.bundleId.endsWith('ticketbunkerscanner')));
});

test('maps saved certificate serial and only returns App Store profile metadata', async () => {
  const client = mock(), result = await inspectSigning(client), output = JSON.stringify(result);
  assert.equal(result.complete, true);
  assert.deepEqual(result.savedCertificateIds, ['CERT123']);
  assert.equal(result.apps.length, 2);
  assert.equal(result.apps[0].bundleState, 'REGISTERED');
  assert.equal(result.apps[0].bundleId, 'FAN123');
  assert.equal(result.apps[1].bundleId, 'ORG123');
  assert.equal(result.apps[0].profiles[0].state, 'ACTIVE');
  assert.equal(result.apps[0].profiles[0].certificates[0].serialNumber, SAVED_SERIAL);
  assert.equal(result.apps[0].profiles.length, 1);
  assert.doesNotMatch(output, /NEVER_PRINT|certificateContent|profileContent|seedId/);
  assert.ok(client.calls.every(url => !url.href.includes('ticketbunkerscanner')));
  assert.ok(client.calls.every(url => [...url.searchParams.values()].every(value => !/Content/.test(value))));
});

test('no existing profiles is a verified empty result rather than a signing-ready claim', async () => {
  const client = mock({ '/v1/bundleIds/FAN123/profiles': () => ({ data: [] }) });
  const result = await inspectSigning(client);
  assert.equal(result.complete, true);
  assert.deepEqual(result.apps[0].profiles, []);
  assert.equal(result.apps[0].bundleState, 'REGISTERED');
});

test('permission failures remain explicit while other metadata stays available', async () => {
  const client = mock({ '/v1/certificates': () => { throw new Error('Apple HTTP 403: FORBIDDEN'); } });
  const result = await inspectSigning(client);
  assert.equal(result.complete, false);
  assert.deepEqual(result.distributionCertificates, []);
  assert.match(result.errors[0], /Apple HTTP 403: FORBIDDEN/);
  assert.equal(result.apps[0].bundleState, 'REGISTERED');
});

test('a non-matching prefix result is not followed into another app profiles', async () => {
  const client = mock({ '/v1/bundleIds': () => ({ data: [{ id: 'WRONG', attributes: { identifier: 'pt.soundbunker.ticketbunkerscanner' } }] }) });
  const result = await inspectSigning(client);
  assert.equal(result.complete, true);
  assert.ok(result.apps.every(app => app.bundleState === 'NOT_FOUND'));
  assert.ok(client.calls.every(url => !url.pathname.endsWith('/profiles')));
});

test('selects the exact customer identifier when Apple also returns its organiser prefix match', async () => {
  const client = mock({ '/v1/bundleIds': url => ({ data: [
    { id: 'FAN123', attributes: { identifier: NEW_APPS[0].bundleId } },
    { id: 'ORG123', attributes: { identifier: NEW_APPS[1].bundleId } },
  ] }) });
  const result = await inspectSigning(client);
  assert.equal(result.complete, true);
  assert.equal(result.apps[0].bundleId, 'FAN123');
  assert.equal(result.apps[1].bundleId, 'ORG123');
});

test('blocks content requests, unknown routes, includes and scanner identifier before API access', async () => {
  let calls = 0;
  const client = metadataOnlyClient({ get: async () => { calls++; return {}; } });
  for (const path of [
    'profiles/PROFILE123?fields[profiles]=profileContent',
    'profiles/PROFILE123/certificates?fields[certificates]=certificateContent',
    'bundleIds?fields[bundleIds]=identifier&filter[identifier]=pt.soundbunker.ticketbunkerscanner',
    'certificates?fields[certificates]=serialNumber&include=passTypeId',
    'certificates',
    'apps/6837950372',
  ]) await assert.rejects(client.get(path));
  assert.equal(calls, 0);
});
