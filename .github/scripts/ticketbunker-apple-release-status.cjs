'use strict';

const { sign } = require('node:crypto');
const { appendFileSync } = require('node:fs');
const API_ORIGIN = 'https://api.appstoreconnect.apple.com';
const APPS = Object.freeze([
  { name: 'TicketBunker Scanner', id: '6823316315', bundleId: 'pt.soundbunker.ticketbunkerscanner', scanner: true },
  { name: 'The TicketBunker', id: '6837950372', bundleId: 'pt.soundbunker.theticketbunker' },
  { name: 'TicketBunker For Organisers', id: '6837950804', bundleId: 'pt.soundbunker.theticketbunker.organiser' },
]);

function apiUrl(path, version = 'v1') {
  const url = new URL(path.startsWith('https://') ? path : `${API_ORIGIN}/${version}/${path}`);
  if (url.origin !== API_ORIGIN || url.username || url.password || !/^\/v[12]\//.test(url.pathname)) {
    throw new Error('Unexpected Apple API URL');
  }
  return url;
}

function createAppleClient({ key, kid, issuer, fetchImpl = fetch, now = Date.now }) {
  if (!key || !kid || !issuer) throw new Error('Existing Apple release credentials are required');
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const issued = Math.floor(now() / 1000);
  const claim = `${encode({ alg: 'ES256', kid, typ: 'JWT' })}.${encode({ iss: issuer, iat: issued, exp: issued + 600, aud: 'appstoreconnect-v1' })}`;
  const token = `${claim}.${sign('sha256', Buffer.from(claim), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
  return {
    async get(path, version = 'v1') {
      const response = await fetchImpl(apiUrl(path, version), {
        method: 'GET', headers: { Authorization: `Bearer ${token}` },
        redirect: 'error', signal: AbortSignal.timeout(30000),
      });
      let result;
      try { result = await response.json(); } catch { throw new Error(`Apple HTTP ${response.status}: invalid JSON`); }
      if (!response.ok) {
        const codes = result.errors?.map(error => error.code).filter(code => /^[A-Z0-9_\.]+$/.test(code));
        throw new Error(`Apple HTTP ${response.status}${codes?.length ? `: ${codes.join(', ')}` : ''}`);
      }
      return result;
    },
  };
}

async function collection(client, path, version = 'v1') {
  const rows = [], seen = new Set();
  let next = path;
  while (next) {
    const url = apiUrl(next, version).href;
    if (seen.has(url)) throw new Error('Apple API pagination loop');
    seen.add(url);
    if (seen.size > 20) throw new Error('Apple API pagination limit exceeded');
    const result = await client.get(next, version);
    if (!Array.isArray(result.data)) throw new Error('Expected Apple API collection');
    rows.push(...result.data);
    next = result.links?.next || null;
  }
  return rows;
}

function buildRecord(build) {
  if (!build) return null;
  const a = build.attributes || {};
  const declaration = build.relationships?.appEncryptionDeclaration;
  return {
    id: build.id, buildNumber: a.version, processingState: a.processingState,
    uploadedDate: a.uploadedDate, usesNonExemptEncryption: a.usesNonExemptEncryption ?? null,
    hasEncryptionDeclaration: declaration && Object.hasOwn(declaration, 'data') ? Boolean(declaration.data) : null,
  };
}

async function inspectApp(client, app) {
  const identity = (await client.get(`apps/${app.id}?fields[apps]=bundleId,name`)).data;
  if (identity?.id !== app.id || identity?.attributes?.bundleId !== app.bundleId) {
    throw new Error(`Apple app identity mismatch for ${app.name}`);
  }
  const errors = [], warnings = [];
  async function required(label, run, fallback) {
    try { return await run(); } catch (error) { errors.push(`${label}: ${error.message}`); return fallback; }
  }
  async function optional(label, run) {
    try { return await run(); } catch (error) { warnings.push(`${label}: ${error.message}`); return null; }
  }
  const [versions, builds, reviews] = await Promise.all([
    required('store versions', () => collection(client, `apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=200&fields[appStoreVersions]=platform,versionString,appStoreState,appVersionState,releaseType,createdDate`), []),
    required('latest builds', async () => {
      const result = await client.get(`builds?filter[app]=${app.id}&sort=-uploadedDate&limit=10&fields[builds]=version,processingState,uploadedDate,usesNonExemptEncryption,appEncryptionDeclaration`);
      if (!Array.isArray(result.data)) throw new Error('Expected Apple API collection');
      return result.data;
    }, []),
    required('review submissions', () => collection(client, `apps/${app.id}/reviewSubmissions?limit=200&fields[reviewSubmissions]=state,platform,submittedDate`), []),
  ]);
  const storeVersions = await Promise.all(versions.filter(v => v.attributes?.platform === 'IOS').map(async version => {
    const selectedBuild = await required(`selected build for ${version.attributes.versionString}`, async () => {
      const relation = await client.get(`appStoreVersions/${version.id}/relationships/build`);
      if (!relation.data) return null;
      const known = builds.find(b => b.id === relation.data.id);
      return buildRecord(known || (await client.get(`builds/${relation.data.id}?fields[builds]=version,processingState,uploadedDate,usesNonExemptEncryption,appEncryptionDeclaration`)).data);
    }, null);
    return { id: version.id, ...version.attributes, selectedBuild };
  }));
  const dateOrder = (a, b, field) => (Date.parse(b[field]) || 0) - (Date.parse(a[field]) || 0);
  storeVersions.sort((a, b) => dateOrder(a, b, 'createdDate') || b.versionString.localeCompare(a.versionString, undefined, { numeric: true }));
  const record = {
    name: app.name, appId: app.id, bundleId: app.bundleId,
    complete: errors.length === 0, storeVersions,
    latestBuilds: builds.map(buildRecord),
    reviewSubmissions: reviews.filter(r => r.attributes?.platform === 'IOS').map(r => ({ id: r.id, ...r.attributes })).sort((a, b) => dateOrder(a, b, 'submittedDate')),
    errors, warnings,
  };
  if (app.scanner) {
    const [availability, declarations] = await Promise.all([
      optional('scanner availability', async () => {
        const availability = (await client.get(`apps/${app.id}/appAvailabilityV2`)).data;
        if (!availability?.id) throw new Error('Missing Apple availability record');
        const rows = await collection(client, `appAvailabilities/${availability.id}/territoryAvailabilities?include=territory&limit=200`, 'v2');
        const france = rows.find(r => r.relationships?.territory?.data?.id === 'FRA');
        return { franceSelected: france?.attributes?.available ?? null, territories: rows.length };
      }),
      optional('scanner encryption declarations', async () => {
        const fields = 'appEncryptionDeclarationState,platform,availableOnFrenchStore,exempt,containsProprietaryCryptography,containsThirdPartyCryptography';
        return (await collection(client, `apps/${app.id}/appEncryptionDeclarations?fields[appEncryptionDeclarations]=${fields}&limit=200`)).map(d => ({ id: d.id, ...d.attributes }));
      }),
    ]);
    record.availability = availability;
    record.encryptionDeclarations = declarations;
  }
  return record;
}

async function inspectAll(client, apps = APPS) {
  const records = await Promise.all(apps.map(async app => {
    try { return await inspectApp(client, app); }
    catch (error) { return { name: app.name, appId: app.id, bundleId: app.bundleId, complete: false, errors: [error.message] }; }
  }));
  return { checkedAt: new Date().toISOString(), complete: records.every(r => r.complete), apps: records };
}

async function main() {
  const client = createAppleClient({ key: process.env.APPLE_KEY_P8, kid: process.env.APPLE_API_KEY_ID, issuer: process.env.APPLE_API_ISSUER });
  const report = await inspectAll(client), output = JSON.stringify(report, null, 2);
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Apple release status (read only)\n\n\`\`\`json\n${output}\n\`\`\`\n`);
  if (!report.complete) process.exitCode = 1;
}

module.exports = { APPS, apiUrl, createAppleClient, collection, buildRecord, inspectApp, inspectAll };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
