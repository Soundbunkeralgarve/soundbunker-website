'use strict';
const { sign } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { mkdirSync, writeFileSync, renameSync, unlinkSync, appendFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { apiUrl, createAppleClient, collection } = require('./ticketbunker-apple-release-status.cjs');

const CERTIFICATE_ID = 'Y7RYH4DGCH';
const CERTIFICATE_SERIAL = '44FD863171BA2EB7F80E9AB16A6FB3C5';
const TEAM = '488DLN54MP';
const TARGETS = Object.freeze([
  { name: 'TicketBunker Customer App Store 2026-11-23', slug: 'theticketbunker', bundleId: '75H2KGH99Y', identifier: 'pt.soundbunker.theticketbunker' },
  { name: 'TicketBunker Organiser App Store 2026-11-23', slug: 'theticketbunker-organiser', bundleId: 'QQXSPY9BZ4', identifier: 'pt.soundbunker.theticketbunker.organiser' },
]);
const serial = value => String(value || '').replace(/[:\s]/g, '').toUpperCase();
const unexpired = (date, now) => Number.isFinite(Date.parse(date)) && Date.parse(date) > now;
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9-]+$/.test(value);

function profileCreateRequest(target) {
  const allowed = TARGETS.find(app => app.bundleId === target.bundleId && app.identifier === target.identifier && app.name === target.name);
  if (!allowed) throw new Error('Refusing profile creation outside the two authorised app identities.');
  return { data: {
    type: 'profiles', attributes: { name: allowed.name, profileType: 'IOS_APP_STORE' },
    relationships: {
      bundleId: { data: { type: 'bundleIds', id: allowed.bundleId } },
      certificates: { data: [{ type: 'certificates', id: CERTIFICATE_ID }] },
    },
  } };
}

function createProvisioningClient({ key, kid, issuer, fetchImpl = fetch }) {
  const readonly = createAppleClient({ key, kid, issuer, fetchImpl });
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const claim = `${encode({ alg: 'ES256', kid, typ: 'JWT' })}.${encode({ iss: issuer, iat, exp: iat + 600, aud: 'appstoreconnect-v1' })}`;
  const token = `${claim}.${sign('sha256', Buffer.from(claim), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  return {
    get: readonly.get,
    async createProfile(target) {
      const body = profileCreateRequest(target);
      const response = await fetchImpl(apiUrl('profiles'), {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(30000),
      });
      let result;
      try { result = await response.json(); } catch { throw new Error(`Apple HTTP ${response.status}: invalid profile response; do not retry creation`); }
      if (!response.ok) {
        const codes = result.errors?.map(error => error.code).filter(code => /^[A-Z0-9_.]+$/.test(code));
        throw new Error(`Apple HTTP ${response.status}${codes?.length ? `: ${codes.join(', ')}` : ''}; profile creation stopped without retry`);
      }
      if (response.status !== 201 || !safeId(result.data?.id)) throw new Error('Unexpected Apple profile creation response; do not retry creation.');
      return result.data.id;
    },
  };
}

async function certificateIds(client, profileId) {
  if (!safeId(profileId)) throw new Error('Unexpected Apple profile ID');
  return (await collection(client, `profiles/${profileId}/relationships/certificates?limit=200`)).map(item => item.id);
}

async function planProfiles(client, now = Date.now()) {
  const certificate = (await client.get(`certificates/${CERTIFICATE_ID}?fields[certificates]=serialNumber,expirationDate,certificateType`)).data;
  if (certificate?.id !== CERTIFICATE_ID || serial(certificate.attributes?.serialNumber) !== CERTIFICATE_SERIAL ||
      !['DISTRIBUTION', 'IOS_DISTRIBUTION'].includes(certificate.attributes?.certificateType) || !unexpired(certificate.attributes?.expirationDate, now)) {
    throw new Error('The existing authorised distribution certificate does not match or has expired.');
  }
  const plans = [];
  for (const target of TARGETS) {
    const bundle = (await client.get(`bundleIds/${target.bundleId}?fields[bundleIds]=identifier`)).data;
    if (bundle?.id !== target.bundleId || bundle.attributes?.identifier !== target.identifier) throw new Error('Apple bundle identity changed; no profiles were created.');
    const profiles = await collection(client, `bundleIds/${target.bundleId}/profiles?limit=200&fields[profiles]=name,profileState,profileType,expirationDate`);
    let reuse = null;
    for (const profile of profiles.filter(profile => profile.attributes?.profileType === 'IOS_APP_STORE' && profile.attributes.profileState === 'ACTIVE' && unexpired(profile.attributes.expirationDate, now))) {
      const ids = await certificateIds(client, profile.id);
      if (ids.length === 1 && ids[0] === CERTIFICATE_ID) { reuse = profile.id; break; }
    }
    if (!reuse && profiles.some(profile => profile.attributes?.name === target.name)) throw new Error('The intended profile name already exists with an unsuitable state or certificate; no replacement was attempted.');
    plans.push({ target, profileId: reuse });
  }
  return plans;
}

async function getVerifiedProfile(client, target, profileId, now = Date.now()) {
  if (!TARGETS.some(app => app.bundleId === target.bundleId && app.identifier === target.identifier) || !safeId(profileId)) throw new Error('Unexpected profile target.');
  const profile = (await client.get(`profiles/${profileId}?fields[profiles]=name,profileType,profileState,expirationDate,profileContent`)).data;
  if (profile?.id !== profileId || profile.attributes?.profileType !== 'IOS_APP_STORE' || profile.attributes.profileState !== 'ACTIVE' || !unexpired(profile.attributes.expirationDate, now)) throw new Error('Downloaded App Store profile is invalid or expired.');
  const bundle = (await client.get(`profiles/${profileId}/bundleId?fields[bundleIds]=identifier`)).data;
  if (bundle?.id !== target.bundleId || bundle.attributes?.identifier !== target.identifier) throw new Error('Downloaded profile belongs to another app.');
  const ids = await certificateIds(client, profileId);
  if (ids.length !== 1 || ids[0] !== CERTIFICATE_ID) throw new Error('Downloaded profile uses another distribution certificate.');
  const encoded = profile.attributes.profileContent;
  if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/=\s]+$/.test(encoded)) throw new Error('Missing profile content.');
  const content = Buffer.from(encoded.replace(/\s/g, ''), 'base64');
  if (content.length < 128 || content.length > 1024 * 1024) throw new Error('Unexpected profile size.');
  return { profile, content };
}

async function prepareProfiles(client, saveVerified, now = Date.now(), onRecord = () => {}) {
  // Verify both app identities and all reads before the first possible POST.
  const plans = await planProfiles(client, now), records = [];
  for (const plan of plans) {
    const created = !plan.profileId;
    const profileId = plan.profileId || await client.createProfile(plan.target);
    const { profile, content } = await getVerifiedProfile(client, plan.target, profileId, now);
    const verified = await saveVerified(plan.target, profile, content);
    const record = { app: plan.target.slug, bundleIdentifier: plan.target.identifier, bundleId: plan.target.bundleId,
      profileId, profileName: profile.attributes.name, profileState: profile.attributes.profileState,
      expirationDate: profile.attributes.expirationDate, certificateId: CERTIFICATE_ID,
      certificateSerial: CERTIFICATE_SERIAL, teamIdentifier: TEAM, created, ...verified };
    records.push(record); onRecord(record);
  }
  return records;
}

function saveVerifiedProfile(directory, temporaryDirectory) {
  return async (target, profile, content) => {
    const temporary = join(temporaryDirectory, `${target.slug}-unverified.mobileprovision`);
    const fileName = `${target.slug}-2026-11-23.mobileprovision`;
    writeFileSync(temporary, content, { mode: 0o600 });
    try {
      const stdout = execFileSync('python3', [join(__dirname, 'verify-ticketbunker-profile.py'), temporary, target.identifier], {
        encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024,
        env: { PATH: process.env.PATH, LANG: 'C.UTF-8', TZ: 'UTC' },
      });
      const verified = JSON.parse(stdout);
      if (verified.name !== profile.attributes.name || Date.parse(verified.expirationDate) !== Date.parse(profile.attributes.expirationDate)) throw new Error('Signed profile metadata mismatch.');
      renameSync(temporary, join(directory, fileName));
      return { fileName, sha256: verified.sha256, uuid: verified.uuid, applicationIdentifier: verified.applicationIdentifier };
    } catch {
      throw new Error(`Signed profile verification failed for ${target.slug}; unverified bytes were excluded from artifacts.`);
    } finally {
      try { unlinkSync(temporary); } catch {}
    }
  };
}

async function main() {
  if (!process.env.RUNNER_TEMP) throw new Error('A private runner temporary directory is required.');
  const directory = join(resolve(process.env.RUNNER_TEMP), 'ticketbunker-appstore-profiles');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const report = { checkedAt: new Date().toISOString(), complete: false, profiles: [], errors: [] };
  try {
    const client = createProvisioningClient({ key: process.env.APPLE_KEY_P8, kid: process.env.APPLE_API_KEY_ID, issuer: process.env.APPLE_API_ISSUER });
    await prepareProfiles(client, saveVerifiedProfile(directory, process.env.RUNNER_TEMP), Date.now(), record => report.profiles.push(record));
    report.complete = true;
  } catch (error) { report.errors.push(error.message); process.exitCode = 1; }
  const output = JSON.stringify(report, null, 2);
  writeFileSync(join(directory, 'profile-metadata.json'), output + '\n', { mode: 0o600 });
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## App Store provisioning preparation\n\n\`\`\`json\n${output}\n\`\`\`\n`);
}
module.exports = { CERTIFICATE_ID, CERTIFICATE_SERIAL, TEAM, TARGETS, profileCreateRequest, createProvisioningClient, planProfiles, getVerifiedProfile, prepareProfiles };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
