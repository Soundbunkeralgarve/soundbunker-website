import {CITY_PAGES} from './city-places.js';

// Ordinary, untracked links to public booking/search pages. A directory link does
// not imply an affiliate agreement, a quote, supplier availability or a reservation.
const normal = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
const regions = new Intl.DisplayNames(['en'], {type: 'region'});
export function tripDestination(country = '', city = '') {
  const name = String(city || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  let code = /^[A-Za-z]{2}$/.test(String(country)) ? String(country).toUpperCase() : '';
  const known = CITY_PAGES.find(([slug, label, cc, query]) =>
    (!code || cc === code) && [slug, label.replace(/^the /, ''), query].some(v => normal(v) === normal(name)));
  if (!code && known) code = known[2];
  let countryName = '';
  try { if (code) countryName = regions.of(code) || ''; } catch { /* no country */ }
  return {city: name, country: code, search: [name, countryName].filter(Boolean).join(', ')};
}

const entry = (id, name, url, description) => ({id, name, url, description, commercial: 'direct'});
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
      entry('blacklane-direct', 'Check Blacklane chauffeur services', 'https://www.blacklane.com/en/cities/', 'Check city coverage and available airport, hourly and chauffeur services with Blacklane.'),
      entry('welcome-direct', 'Check Welcome Pickups', 'https://www.welcomepickups.com/', 'Check private airport transfers for your pickup location and group size.')
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
  ['/vip-transfers', 'Chauffeurs & transfers', 'Private airport rides and premium car services.'],
  ['/restaurants', 'Restaurants & offers', 'Find a table before the show or a group dinner.'],
  ['/stag-hen-weekends', 'Stag & hen weekends', 'Activities, nights out and specialist group bookings.']
]);
