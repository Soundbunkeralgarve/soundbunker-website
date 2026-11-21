import {readFile} from 'node:fs/promises';
import {approvedPartnerListings} from '../ticketbunker-site/partner-listings-model.js';

const config = JSON.parse(await readFile(new URL('../ticketbunker-site/partner-listings-config.json', import.meta.url), 'utf8'));
const active = approvedPartnerListings(config);
const published = Array.isArray(config.listings) ? config.listings.filter(l => l?.status === 'published') : [];
if (config.enabled && (!active.length || active.length !== published.length)) {
  console.error('Partner catalogue rejected: enabled publication contains an unavailable or invalid listing. Check approval, country, tracking link, duplicate IDs and expiry.');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({enabled: config.enabled === true, visibleListings: active.length,
    pendingProviders: (config.providers || []).filter(p => p.status !== 'approved').map(p => p.id),
    publicSection: active.length ? 'visible' : 'hidden'}));
}
