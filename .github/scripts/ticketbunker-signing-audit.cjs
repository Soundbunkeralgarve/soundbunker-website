'use strict';
const { appendFileSync } = require('node:fs');
const { APPS, apiUrl, createAppleClient, collection } = require('./ticketbunker-apple-release-status.cjs');

const NEW_APPS = Object.freeze(APPS.filter(app => app.id !== '6823316315'));
const SAVED_SERIAL = '44FD863171BA2EB7F80E9AB16A6FB3C5';
const FIELDS = Object.freeze({
  certificates: ['serialNumber', 'expirationDate'],
  bundleIds: ['identifier'],
  profiles: ['name', 'profileState', 'profileType', 'expirationDate'],
});
const serial = value => String(value || '').replace(/[:\s]/g, '').toUpperCase();

function metadataOnlyClient(client) {
  return {
    async get(path, version = 'v1') {
      const url = apiUrl(path, version);
      const resource = /^\/v1\/certificates$/.test(url.pathname) ? 'certificates'
        : /^\/v1\/bundleIds$/.test(url.pathname) ? 'bundleIds'
        : /^\/v1\/bundleIds\/[A-Za-z0-9-]+\/profiles$/.test(url.pathname) ? 'profiles'
        : /^\/v1\/profiles\/[A-Za-z0-9-]+\/certificates$/.test(url.pathname) ? 'certificates' : null;
      if (!resource || url.searchParams.has('include')) throw new Error('Signing audit accepts metadata-only read endpoints.');
      const fields = url.searchParams.get(`fields[${resource}]`)?.split(',');
      if (!fields?.length || fields.some(field => !FIELDS[resource].includes(field))) {
        throw new Error('Signing audit requires explicit metadata-only fields.');
      }
      for (const key of url.searchParams.keys()) {
        if (key.startsWith('fields[') && key !== `fields[${resource}]`) throw new Error('Unexpected signing metadata fields.');
      }
      if (resource === 'bundleIds' && !NEW_APPS.some(app => app.bundleId === url.searchParams.get('filter[identifier]'))) {
        throw new Error('Signing audit only reads the two new app bundle identifiers.');
      }
      return client.get(path, version);
    },
  };
}

function certificateMetadata(certificate) {
  return {
    id: certificate.id,
    serialNumber: certificate.attributes?.serialNumber ?? null,
    expirationDate: certificate.attributes?.expirationDate ?? null,
  };
}

async function inspectSigning(baseClient) {
  const client = metadataOnlyClient(baseClient), errors = [];
  let certificates = [];
  try {
    certificates = (await collection(client, 'certificates?filter[certificateType]=DISTRIBUTION,IOS_DISTRIBUTION&limit=200&fields[certificates]=serialNumber,expirationDate')).map(certificateMetadata);
  } catch (error) { errors.push(`distribution certificates: ${error.message}`); }

  const apps = await Promise.all(NEW_APPS.map(async app => {
    const report = { name: app.name, appId: app.id, bundleIdentifier: app.bundleId, bundleId: null, bundleState: 'UNKNOWN', profiles: [], errors: [] };
    try {
      const bundles = await collection(client, `bundleIds?filter[identifier]=${app.bundleId}&limit=200&fields[bundleIds]=identifier`);
      if (bundles.length > 1 || bundles.some(bundle => bundle.attributes?.identifier !== app.bundleId)) {
        throw new Error('Unexpected or ambiguous Apple bundle identifier.');
      }
      if (!bundles.length) { report.bundleState = 'NOT_FOUND'; return report; }
      report.bundleId = bundles[0].id;
      report.bundleState = 'REGISTERED';
      const profiles = await collection(client, `bundleIds/${report.bundleId}/profiles?limit=200&fields[profiles]=name,profileState,profileType,expirationDate`);
      for (const profile of profiles.filter(profile => profile.attributes?.profileType === 'IOS_APP_STORE')) {
        const metadata = {
          id: profile.id,
          name: profile.attributes.name,
          state: profile.attributes.profileState,
          expirationDate: profile.attributes.expirationDate ?? null,
          certificates: [],
        };
        try {
          metadata.certificates = (await collection(client, `profiles/${profile.id}/certificates?limit=200&fields[certificates]=serialNumber,expirationDate`)).map(certificateMetadata);
        } catch (error) { report.errors.push(`profile ${profile.id} certificates: ${error.message}`); }
        report.profiles.push(metadata);
      }
    } catch (error) { report.errors.push(error.message); }
    return report;
  }));
  return {
    checkedAt: new Date().toISOString(),
    complete: errors.length === 0 && apps.every(app => app.errors.length === 0),
    distributionCertificates: certificates,
    savedCertificateSerial: SAVED_SERIAL,
    savedCertificateIds: certificates.filter(certificate => serial(certificate.serialNumber) === SAVED_SERIAL).map(certificate => certificate.id),
    apps, errors,
  };
}

async function main() {
  const client = createAppleClient({ key: process.env.APPLE_KEY_P8, kid: process.env.APPLE_API_KEY_ID, issuer: process.env.APPLE_API_ISSUER });
  const report = await inspectSigning(client), output = JSON.stringify(report, null, 2);
  console.log(output);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Apple signing metadata (read only)\n\n\`\`\`json\n${output}\n\`\`\`\n`);
  if (!report.complete) process.exitCode = 1;
}
module.exports = { NEW_APPS, SAVED_SERIAL, metadataOnlyClient, certificateMetadata, inspectSigning };
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
