import {CITY_PAGES} from './city-places.js';

// Public supplier searches and explicitly approved affiliate links. Each entry keeps
// its commercial status; a search link never promises a quote or vehicle availability.
const normal = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
const regions = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['en'], {type: 'region'}) : null;
export function tripDestination(country = '', city = '') {
  const name = String(city || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  let code = /^[A-Za-z]{2}$/.test(String(country)) ? String(country).toUpperCase() : '';
  const known = CITY_PAGES.find(([slug, label, cc, query]) =>
    (!code || cc === code) && [slug, label.replace(/^the /, ''), query].some(v => normal(v) === normal(name)));
  if (!code && known) code = known[2];
  let countryName = '';
  try { if (code) countryName = regions?.of(code) || code; } catch { countryName = code; }
  return {city: name, country: code, search: [name, countryName].filter(Boolean).join(', ')};
}

const entry = (id, name, url, description) => ({id, name, url, description, commercial: 'direct'});
// Parameters match the approved account's link builder (23 Nov 2026). Public
// destination searches are not inventory records and contain no API credential.
export function viatorTransportProviders(country = '', city = '') {
  const d = tripDestination(country, city);
  if (!d.city) return [];
  return [
    ['limos', 'limousine', 'Limo options',
      'Check the exact vehicle and passenger limit. A stretched limousine must be explicitly listed by the supplier.'],
    ['chauffeurs', 'private chauffeur', 'Luxury chauffeur cars',
      'Explore private chauffeur options and confirm the car class, pickup, waiting time and passenger capacity.'],
    ['transfers', 'airport transfer', 'Airport & group transfers',
      'Check airport transfer options, luggage capacity, child seats, pickup details and the final total.']
  ].map(([kind, query, serviceLabel, description]) => {
    const url = new URL('https://www.viator.com/searchResults/all');
    for (const [key, value] of Object.entries({text: d.search + ' ' + query, pid: 'P00333211', mcid: '42383', medium: 'link', campaign: 'tb-limos'})) url.searchParams.set(key, value);
    return {id: 'viator-' + kind, name: 'Search ' + d.city + ' ' + (kind === 'limos' ? 'limos' : kind === 'chauffeurs' ? 'chauffeur cars' : 'airport transfers') + ' on Viator',
      url: url.href, description, serviceLabel, commercial: 'affiliate'};
  });
}
const forkDomains = {GB: 'www.thefork.co.uk', PT: 'www.thefork.pt', ES: 'www.thefork.es', FR: 'www.thefork.fr', IT: 'www.thefork.it'};
export function directoryProviders(kind, country = '', city = '') {
  const d = tripDestination(country, city);
  switch (kind) {
    case 'stay': {
      const url = new URL('https://www.expedia.co.uk/Hotel-Search');
      if (d.search) url.searchParams.set('destination', d.search);
      return [entry('expedia-hotels', 'Search hotels on Expedia', url.href,
        'Choose your dates, guests, location and cancellation terms on Expedia.')];
    }
    case 'travel': return [
      entry('trainline-direct', 'Search Trainline', 'https://www.thetrainline.com/', 'Compare available train and coach routes; enter your departure and destination.'),
      entry('omio-direct', 'Search Omio', 'https://www.omio.com/', 'Check train, coach and other travel options for your journey.')
    ];
    case 'car': return [entry('expedia-cars', 'Search car hire on Expedia', 'https://www.expedia.co.uk/Cars',
      'Choose pickup location and times, driver details and cover; check deposits, excess and fuel policy.')];
    case 'eat': {
      const maps = new URL('https://www.google.com/maps/search/');
      maps.searchParams.set('api', '1');
      maps.searchParams.set('query', ['restaurants', d.search].filter(Boolean).join(' '));
      return [
        ...(forkDomains[d.country] ? [entry('thefork-direct', 'Browse TheFork', 'https://' + forkDomains[d.country] + '/',
          'Select your city and date to see participating restaurants and any offers available.')] : []),
        entry('restaurant-map', 'Find restaurants on Google Maps', maps.href, 'Explore restaurants around your destination and check their own booking details.')
      ];
    }
    case 'transfer': return [
      ...viatorTransportProviders(d.country, d.city),
      {...entry('blacklane-direct', 'Check Blacklane chauffeur services', 'https://www.blacklane.com/en/cities/', 'Explore premium chauffeur cars and vans. Check city coverage, vehicle classes and the total quote.'), serviceLabel: 'Luxury chauffeur cars'},
      {...entry('welcome-direct', 'Check Welcome Pickups', 'https://www.welcomepickups.com/', 'Check private airport transfers for your pickup location, luggage and group size.'), serviceLabel: 'Airport & group transfers'}
    ];
    case 'groups': return [
      entry('stagweb-direct', 'Explore StagWeb weekends', 'https://www.stagweb.co.uk/', 'Browse the specialist’s UK and European stag destinations, activities and accommodation.'),
      entry('gohen-direct', 'Explore GoHen weekends', 'https://www.gohen.com/', 'Browse the specialist’s UK and European hen destinations and group weekend options.')
    ];
    default: return [];
  }
}

export const GUIDE_LINKS = Object.freeze([
  ['/hotels', 'Hotels', 'Find a place to stay around your plans.'],
  ['/car-hire', 'Car hire', 'Check pickup, cover and rental conditions.'],
  ['/travel', 'Trains & coaches', 'Compare ways to get to your destination.'],
  ['/vip-transfers', 'Limos & VIP transport', 'Check limo, chauffeur and private transfer options.'],
  ['/restaurants', 'Restaurants & offers', 'Find a table before the show or a group dinner.'],
  ['/stag-hen-weekends', 'Stag & hen weekends', 'Activities, nights out and specialist group bookings.']
]);
