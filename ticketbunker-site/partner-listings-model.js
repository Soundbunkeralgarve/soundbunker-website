// This is a reviewed publication configuration, never a visitor-supplied feed.
// Approval and tracking evidence must be verified in the provider portal before
// changing the configuration; these checks cannot grant a supplier's permission.
export const partnerCategories = Object.freeze({
  events: 'Concerts & events', cinema: 'Cinema', attractions: 'Attractions & experiences'
});

const countries = new Set(('AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW').split(' '));
const ticketmasterCountries = new Set('CA MX US BR CL PE AT BE CZ CY DK FI FR DE GR IE IT KE NL NO PL SA ZA ES SE CH TR AE UG GB AU NZ'.split(' '));
const providerRules = Object.freeze({
  ticketmaster: {name: 'Ticketmaster', categories: ['events'], countries: ticketmasterCountries},
  entradas: {name: 'Entradas.com', categories: ['cinema'], countries: new Set(['ES'])},
  nos: {name: 'Cinemas NOS', categories: ['cinema'], countries: new Set(['PT'])},
  tiqets: {name: 'Tiqets', categories: ['attractions'], countries}
});

const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : '';
const uniqueById = items => {
  const counts = new Map();
  for (const item of items) if (item && typeof item.id === 'string') counts.set(item.id, (counts.get(item.id) || 0) + 1);
  return items.filter(item => item && counts.get(item.id) === 1);
};
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));

function validHostname(value) {
  // Exact DNS hosts only: no wildcard/suffix match, ports, IPs or URL fragments.
  return typeof value === 'string' && value === value.toLowerCase() && value.length <= 253 &&
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(value);
}

export function approvedBookingUrl(value, allowedHosts) {
  if (typeof value !== 'string' || value.length > 4096 || /[\s\\\u0000-\u001f\u007f]/.test(value)) return '';
  try {
    const url = new URL(value);
    const hosts = Array.isArray(allowedHosts) ? allowedHosts.filter(validHostname) : [];
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash || !hosts.includes(url.hostname)) return '';
    // An untracked homepage must never become a fallback booking destination.
    if ((url.pathname === '/' || !url.pathname) && !url.search) return '';
    return url.href;
  } catch { return ''; }
}

export function approvedPartnerListings(config, {country = '', category = '', now = new Date()} = {}) {
  const timestamp = new Date(now).getTime();
  if (!Number.isFinite(timestamp) || !config || config.schemaVersion !== 1 || config.enabled !== true ||
      !Array.isArray(config.providers) || !Array.isArray(config.listings)) return [];
  // Unknown filters fail closed instead of accidentally showing all inventory.
  if (country && !countries.has(country)) return [];
  if (category && !Object.hasOwn(partnerCategories, category)) return [];
  const providers = new Map(uniqueById(config.providers).filter(p =>
    Object.hasOwn(providerRules, p.id) && p.status === 'approved' && text(p.approvalReference, 160) &&
    Array.isArray(p.countries) && p.countries.length > 0 &&
    p.countries.every(c => countries.has(c) && providerRules[p.id].countries.has(c)) &&
    Array.isArray(p.allowedBookingHosts) && p.allowedBookingHosts.length > 0 && p.allowedBookingHosts.every(validHostname) &&
    Array.isArray(p.bookingLinks)
  ).map(p => [p.id, p]));

  return uniqueById(config.listings).flatMap(listing => {
    const provider = providers.get(listing.providerId);
    const rule = providerRules[listing.providerId];
    if (!provider || listing.status !== 'published' || !text(listing.id, 100) ||
        !text(listing.title, 140) || !text(listing.description, 400) || !text(listing.city, 100) ||
        !provider.countries.includes(listing.countryCode) || !rule.categories.includes(listing.category) ||
        (country && listing.countryCode !== country) || (category && listing.category !== category)) return [];
    const link = uniqueById(provider.bookingLinks).find(l => l.id === listing.bookingLinkId);
    if (!link || !text(link.trackingReference, 160) || !validDate(link.trackingVerifiedAt) ||
        Date.parse(link.trackingVerifiedAt) > timestamp || !validDate(link.expiresAt) || Date.parse(link.expiresAt) <= timestamp) return [];
    const bookingUrl = approvedBookingUrl(link.url, provider.allowedBookingHosts);
    if (!bookingUrl) return [];
    return [{id: listing.id, providerId: provider.id, providerName: rule.name, title: listing.title.trim(),
      description: listing.description.trim(), city: listing.city.trim(), countryCode: listing.countryCode,
      category: listing.category, categoryName: partnerCategories[listing.category], bookingUrl}];
  });
}
