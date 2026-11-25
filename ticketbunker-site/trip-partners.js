// Approved affiliate links are separate from ordinary public supplier directories.
// Pending affiliate applications never acquire tracking or approval through a fallback.
import {directoryProviders} from './travel-directory.js';
// Awin links use Awin's own click tracker with our publisher ID (public, not a secret).
const AWIN_AFFILIATE = 3163272;
export const awinLink = (merchant, destination) =>
  `https://www.awin1.com/cread.php?awinmid=${merchant}&awinaffid=${AWIN_AFFILIATE}&ued=${encodeURIComponent(destination)}`;
// Awin click references, so its reports show where each sale came from: clickref is the
// page (home, a city slug), clickref2 the spot (card, plan, planner, city-list). Other
// partners' links are left exactly as they are.
export function withClickRef(url, page, spot) {
  try {
    const u = new URL(url);
    if (!/(^|\.)awin1\.com$/.test(u.hostname)) return url;
    const clean = v => String(v || '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50);
    if (page) u.searchParams.set('clickref', clean(page));
    if (spot) u.searchParams.set('clickref2', clean(spot));
    return u.toString();
  } catch { return url; }
}

// [kind, name, countries it serves ('*' = everywhere), approved, link(cityName)]
export const TRIP_PARTNERS = Object.freeze([
  // Flight-only link generated and opened in the approved Trip.com affiliate portal.
  // Keep its assigned tracking fields unchanged; visitors choose their route there.
  ['flight', 'Search flights on Trip.com', ['*'], true, () => 'https://www.trip.com/flights?Allianceid=11489066&SID=336945869&trip_sub1=&trip_sub3=D21530259'],
  ['travel', 'Trainline', ['GB', 'ES', 'FR', 'IT', 'DE', 'NL', 'BE', 'AT', 'CH'], false, () => 'https://www.thetrainline.com/'],
  ['travel', 'Northern', ['GB'], false, () => awinLink(24353, 'https://www.northernrailway.co.uk/')],
  ['travel', 'TransPennine Express', ['GB'], false, () => awinLink(2829, 'https://www.tpexpress.co.uk/')],
  ['travel', 'Omio', ['*'], false, () => 'https://www.omio.com/'],
  ['travel', 'FerryHopper', ['ES', 'PT', 'IT', 'FR', 'GR', 'HR'], false, () => awinLink(129345, 'https://www.ferryhopper.com/')],
  ['stay', 'Hotel.info', ['GB', 'ES', 'PT', 'FR', 'IT', 'NL', 'IE'], false, () => awinLink(16634, 'https://www.hotel.info/')],
  ['stay', 'Hotel.de', ['DE', 'AT', 'CH', 'CZ', 'HU'], false, () => awinLink(16018, 'https://www.hotel.de/')],
  ['eat', 'tastecard', ['GB'], false, () => awinLink(16164, 'https://www.tastecard.co.uk/')],
  ['eat', 'TheFork', ['IT'], false, () => awinLink(127369, 'https://www.thefork.it/')]
]);
export const TRIP_KINDS = Object.freeze([
  ['flight', 'Flights', 'Choose your route, dates and passengers with the flight provider.'],
  ['travel', 'Trains & coaches', 'Check routes to your destination.'],
  ['car', 'Car hire', 'Check pickup, cover and the total rental price.'],
  ['stay', 'Stay nearby', 'Choose hotels around your destination.'],
  ['eat', 'Eat nearby', 'Restaurant bookings and selected offers.'],
  ['transfer', 'Private transfers', 'Check airport rides and chauffeur coverage.']
]);

export function tripOptions(country, city, {page = '', spot = '', providers = TRIP_PARTNERS, trip = {}} = {}) {
  return TRIP_KINDS.map(([kind, label, blurb]) => ({kind, label, blurb,
    partners: [
      ...providers.filter(([k, , countries, approved]) => k === kind && approved && (countries.includes('*') || countries.includes(country)))
        .map(([, name, , , link]) => ({name, url: withClickRef(link(city), page, spot), commercial: 'affiliate'})),
      ...directoryProviders(kind, country, city, trip)
    ]}));
}
