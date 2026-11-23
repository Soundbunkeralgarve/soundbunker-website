'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync } = require('node:crypto');
const { apiUrl } = require('./ticketbunker-apple-release-status.cjs');
const { CERTIFICATE_ID, CERTIFICATE_SERIAL, TARGETS, profileCreateRequest, createProvisioningClient, planProfiles, prepareProfiles } = require('./ticketbunker-provisioning-prep.cjs');
const NOW = Date.parse('2026-11-23T12:00:00Z');
const EXPIRY = '2027-10-20T07:11:36Z';

function mock({ reuse = false, certificate = {}, wrongBundle = false, denied = false, createDenied = false, wrongDownloadedCertificate = false } = {}) {
  const created = [], calls = [];
  const profileId = target => `PROFILE-${target.slug === 'theticketbunker' ? 'FAN' : 'ORG'}`;
  return {
    created, calls,
    async get(path) {
      const url = apiUrl(path), p = url.pathname;
      calls.push(p);
      if (p === `/v1/certificates/${CERTIFICATE_ID}`) {
        if (denied) throw new Error('Apple HTTP 403: FORBIDDEN');
        return { data: { id: CERTIFICATE_ID, attributes: { serialNumber: CERTIFICATE_SERIAL, expirationDate: EXPIRY, certificateType: 'DISTRIBUTION', ...certificate } } };
      }
      let target = TARGETS.find(target => p === `/v1/bundleIds/${target.bundleId}`);
      if (target) return { data: { id: target.bundleId, attributes: { identifier: wrongBundle ? 'pt.soundbunker.ticketbunkerscanner' : target.identifier } } };
      target = TARGETS.find(target => p === `/v1/bundleIds/${target.bundleId}/profiles`);
      if (target) return { data: reuse ? [{ id: profileId(target), attributes: { profileType: 'IOS_APP_STORE', profileState: 'ACTIVE', name: target.name, expirationDate: EXPIRY } }] : [] };
      target = TARGETS.find(target => p.startsWith(`/v1/profiles/${profileId(target)}`));
      if (target && p.endsWith('/relationships/certificates')) return { data: [{ id: wrongDownloadedCertificate ? 'OTHER-CERT' : CERTIFICATE_ID }] };
      if (target && p.endsWith('/bundleId')) return { data: { id: target.bundleId, attributes: { identifier: target.identifier } } };
      if (target) return { data: { id: profileId(target), attributes: { name: target.name, profileState: 'ACTIVE', profileType: 'IOS_APP_STORE', expirationDate: EXPIRY, profileContent: Buffer.alloc(512, 1).toString('base64') } } };
      throw new Error('Unexpected fixture API path');
    },
    async createProfile(target) {
      const request = profileCreateRequest(target);
      created.push(request);
      if (createDenied) throw new Error('Apple HTTP 403: FORBIDDEN; profile creation stopped without retry');
      return profileId(target);
    },
  };
}
const save = async target => ({ fileName: `${target.slug}.mobileprovision`, sha256: 'verified' });

test('creation body contains only the exact new app and existing certificate', () => {
  for (const target of TARGETS) {
    const body = profileCreateRequest(target).data;
    assert.equal(body.attributes.profileType, 'IOS_APP_STORE');
    assert.equal(body.relationships.bundleId.data.id, target.bundleId);
    assert.deepEqual(body.relationships.certificates.data, [{ type: 'certificates', id: CERTIFICATE_ID }]);
  }
  assert.throws(() => profileCreateRequest({ ...TARGETS[0], identifier: 'pt.soundbunker.ticketbunkerscanner' }), /authorised app identities/);
});

test('creates and downloads both profiles only after complete preflight', async () => {
  const client = mock(), saved = [];
  const records = await prepareProfiles(client, async (target, profile, content) => {
    saved.push(target.slug); assert.ok(content.length >= 128); return save(target);
  }, NOW);
  assert.equal(client.created.length, 2);
  assert.deepEqual(saved, TARGETS.map(target => target.slug));
  assert.ok(records.every(record => record.created && record.certificateId === CERTIFICATE_ID));
  assert.doesNotMatch(JSON.stringify(records), /profileContent|AQEBAQE/);
  assert.ok(client.calls.every(path => !path.includes('ticketbunkerscanner')));
});

test('reuses existing matching active profiles without a POST', async () => {
  const client = mock({ reuse: true });
  const records = await prepareProfiles(client, save, NOW);
  assert.equal(client.created.length, 0);
  assert.ok(records.every(record => !record.created));
});

test('wrong or expired existing certificate stops before profile creation', async () => {
  for (const certificate of [{ serialNumber: 'WRONG' }, { expirationDate: '2025-10-20T07:11:36Z' }, { certificateType: 'DEVELOPER_ID_APPLICATION' }]) {
    const client = mock({ certificate });
    await assert.rejects(prepareProfiles(client, save, NOW), /certificate does not match or has expired/);
    assert.equal(client.created.length, 0);
  }
});

test('bundle mismatch and read permission denial fail before any POST', async () => {
  for (const options of [{ wrongBundle: true }, { denied: true }]) {
    const client = mock(options);
    await assert.rejects(prepareProfiles(client, save, NOW));
    assert.equal(client.created.length, 0);
  }
});

test('403 creation stops immediately without retry or attempting the other app', async () => {
  const client = mock({ createDenied: true });
  await assert.rejects(prepareProfiles(client, save, NOW), /Apple HTTP 403: FORBIDDEN/);
  assert.equal(client.created.length, 1);
});

test('a downloaded certificate mismatch never reaches the artifact writer', async () => {
  const client = mock({ wrongDownloadedCertificate: true }); let writes = 0;
  await assert.rejects(prepareProfiles(client, async () => { writes++; }, NOW), /another distribution certificate/);
  assert.equal(writes, 0);
  assert.equal(client.created.length, 1);
});

test('real HTTP client can only create the guarded profile resource and sanitises permission errors', async () => {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const calls = [];
  const client = createProvisioningClient({ key: privateKey, kid: 'TEST', issuer: 'TEST', fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: false, status: 403, json: async () => ({ errors: [{ code: 'FORBIDDEN', detail: 'PRIVATE_DETAILS_MUST_NOT_ESCAPE' }] }) };
  } });
  await assert.rejects(client.createProfile(TARGETS[0]), error => error.message === 'Apple HTTP 403: FORBIDDEN; profile creation stopped without retry');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, '/v1/profiles');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.redirect, 'error');
  await assert.rejects(client.createProfile({ ...TARGETS[0], bundleId: 'SCANNER' }), /authorised app identities/);
  assert.equal(calls.length, 1);
});
