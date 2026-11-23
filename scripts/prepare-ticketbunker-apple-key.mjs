import { appendFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPrivateKey } from 'node:crypto';

const { APPLE_KEY_P8, APPLE_API_KEY_ID, APPLE_API_ISSUER, RUNNER_TEMP, GITHUB_ENV } = process.env;
if (![APPLE_KEY_P8, APPLE_API_KEY_ID, APPLE_API_ISSUER, RUNNER_TEMP, GITHUB_ENV].every(Boolean)) {
  throw new Error('Existing Apple release API credentials are missing; no credential was created or replaced.');
}
const key = createPrivateKey(APPLE_KEY_P8);
if (key.asymmetricKeyType !== 'ec') throw new Error('Unexpected Apple API key type.');
const path = join(RUNNER_TEMP, 'ticketbunker-existing-apple-api.p8');
writeFileSync(path, APPLE_KEY_P8, { mode: 0o600 });
appendFileSync(GITHUB_ENV, `EXPO_ASC_API_KEY_PATH=${path}\n`);
console.log('Existing Apple API key prepared privately for this job.');
