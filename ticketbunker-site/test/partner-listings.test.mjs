import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {approvedBookingUrl, approvedPartnerListings} from '../partner-listings-model.js';

const now = new Date('2026-11-21T12:00:00Z');
// These reserved example hosts and records exist only in tests. They are not
// supplier credentials, real inventory or actual affiliate tracking links.
const configuration = () => ({
  schemaVersion: 1, enabled: true,
  providers: [{id: 'entradas', status: 'approved', approvalReference: 'test-only-approval', countries: ['ES'],
    allowedBookingHosts: ['approved.example'], bookingLinks: [{id: 'cinema', url: 'https://approved.example/cinema?publisher=test-only',
      trackingReference: 'test-only', trackingVerifiedAt: '2026-11-20T12:00:00Z', expiresAt: '2026-12-20T12:00:00Z'}]}],
  listings: [{id: 'cinema-es', providerId: 'entradas', status: 'published', category: 'cinema', countryCode: 'ES',
    city: 'Madrid', title: 'Test cinema listing', description: 'A test-only destination.', bookingLinkId: 'cinema'}]
});
const select = (config, filters = {}) => approvedPartnerListings(config, {now, ...filters});

test('deployed configuration has no enabled or approved partner offers', async () => {
  const config = JSON.parse(await readFile(new URL('../partner-listings-config.json', import.meta.url), 'utf8'));
  assert.equal(config.enabled, false);
  assert.equal(config.listings.length, 0);
  assert.deepEqual(config.providers.map(p => p.id), ['ticketmaster', 'entradas', 'nos', 'tiqets']);
  assert.ok(config.providers.every(p => p.status === 'pending' && p.bookingLinks.length === 0));
  assert.deepEqual(select(config), []);
});

test('only a published listing with approved, verified and current link is returned', () => {
  const config = configuration();
  const result = select(config);
  assert.equal(result.length, 1);
  assert.equal(result[0].providerName, 'Entradas.com');
  assert.equal(result[0].bookingUrl, 'https://approved.example/cinema?publisher=test-only');
  assert.equal(result[0].approvalReference, undefined);
  for (const change of [
    c => {c.enabled = false;}, c => {c.schemaVersion = 2;}, c => {c.providers[0].status = 'pending';},
    c => {c.providers[0].approvalReference = '';}, c => {c.listings[0].status = 'draft';},
    c => {c.listings[0].bookingLinkId = 'missing';}, c => {c.providers[0].bookingLinks[0].trackingReference = '';},
    c => {c.providers[0].bookingLinks[0].trackingVerifiedAt = null;},
    c => {c.providers[0].bookingLinks[0].trackingVerifiedAt = '2026-11-22T12:00:00Z';},
    c => {c.providers[0].bookingLinks[0].expiresAt = now.toISOString();}
  ]) {
    const changed = structuredClone(config); change(changed);
    assert.deepEqual(select(changed), []);
  }
});

test('booking destinations use HTTPS and an exact reviewed host, with no homepage fallback', () => {
  const hosts = ['approved.example'];
  assert.equal(approvedBookingUrl('https://approved.example/cinema', hosts), 'https://approved.example/cinema');
  for (const url of ['http://approved.example/cinema', 'javascript:alert(1)', '//approved.example/cinema',
    '/api/event-checkout', 'https://approved.example/', 'https://approved.example.evil.example/cinema',
    'https://evil.example/cinema', 'https://child.approved.example/cinema', 'https://user:secret@approved.example/cinema',
    'https://approved.example:8443/cinema', 'https://approved.example/cinema#fragment', 'https://approved.example\\@evil.example/cinema',
    'https://approved.example/cin\nema']) {
    assert.equal(approvedBookingUrl(url, hosts), '', url);
  }
  assert.equal(approvedBookingUrl('https://child.approved.example/cinema', ['*.approved.example']), '');
});

test('country coverage is bounded by both the agreement and the provider market', () => {
  const config = configuration();
  assert.equal(select(config, {country: 'ES', category: 'cinema'}).length, 1);
  assert.deepEqual(select(config, {country: 'PT'}), []);
  assert.deepEqual(select(config, {country: 'XX'}), []);
  assert.deepEqual(select(config, {category: 'attractions'}), []);
  const unsupported = structuredClone(config);
  unsupported.providers[0].countries = ['PT']; unsupported.listings[0].countryCode = 'PT';
  assert.deepEqual(select(unsupported), []);
  config.providers[0].countries = ['ES', 'XX'];
  assert.deepEqual(select(config), []);
});

test('NOS and Ticketmaster are not enabled outside their supported initial markets', () => {
  const config = configuration();
  config.providers[0].id = 'nos'; config.listings[0].providerId = 'nos';
  assert.deepEqual(select(config), []);
  config.providers[0].countries = ['PT']; config.listings[0].countryCode = 'PT';
  assert.equal(select(config)[0].providerName, 'Cinemas NOS');
  config.providers[0].id = 'ticketmaster'; config.listings[0].providerId = 'ticketmaster';
  config.listings[0].category = 'events';
  assert.deepEqual(select(config), []);
  config.providers[0].countries = ['GB']; config.listings[0].countryCode = 'GB';
  assert.equal(select(config)[0].providerName, 'Ticketmaster');
});

test('Tiqets supports only approved destinations and attraction listings', () => {
  const config = configuration();
  config.providers[0].id = 'tiqets'; config.providers[0].countries = ['PT'];
  config.listings[0].providerId = 'tiqets'; config.listings[0].countryCode = 'PT';
  assert.deepEqual(select(config), []);
  config.listings[0].category = 'attractions';
  assert.equal(select(config)[0].providerName, 'Tiqets');
  config.listings[0].countryCode = 'ES';
  assert.deepEqual(select(config), []);
});

test('duplicate provider, link or listing IDs are rejected instead of choosing an ambiguous record', () => {
  for (const field of ['providers', 'listings', 'links']) {
    const config = configuration();
    const list = field === 'links' ? config.providers[0].bookingLinks : config[field];
    list.push(structuredClone(list[0]));
    assert.deepEqual(select(config), []);
  }
});

test('malformed and expired records fail closed without breaking native event discovery', () => {
  for (const config of [null, {}, [], {schemaVersion: 1, enabled: true, providers: null, listings: null}]) {
    assert.deepEqual(select(config), []);
  }
  const config = configuration();
  config.providers.push(null); config.listings.push(null);
  assert.equal(select(config).length, 1);
  assert.deepEqual(select(config, {now: new Date('2027-01-01T00:00:00Z')}), []);
  assert.deepEqual(select(config, {now: 'invalid'}), []);
});
