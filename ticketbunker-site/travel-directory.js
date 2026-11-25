import {CITY_PAGES} from './city-places.js';
import {tripcomStayProviders} from './trip-packages.js';

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
// Dates, guests and rooms the visitor chose on our site, checked before they go into a
// provider's search. Anything unusable is dropped so the provider asks for it instead.
const isoDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) && !Number.isNaN(Date.parse(v + 'T00:00:00Z')) ? String(v) : '';
const whole = (v, lo, hi) => { const n = Number(v); return Number.isInteger(n) && n >= lo && n <= hi ? n : 0; };
const clock = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(String(v || '')) ? String(v) : '';
export function tripDates(trip = {}) {
  let from = isoDay(trip.from), to = isoDay(trip.to);
  if (from && to && to <= from) to = '';
  const adults = whole(trip.adults, 1, 30), rooms = whole(trip.rooms, 1, 8);
  const nights = from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 864e5) : 0;
  return {from, to, nights, adults, rooms: adults ? Math.min(rooms || 1, adults) : rooms, pickup: clock(trip.pickup), dropoff: clock(trip.dropoff)};
}
// Expedia wants one adults value per room, e.g. 5 adults in 2 rooms → adults=3&adults=2.
const perRoom = (adults, rooms) => Array.from({length: rooms}, (_, i) => Math.floor(adults / rooms) + (i < adults % rooms ? 1 : 0));
const ampm = t => { const [h, m] = t.split(':').map(Number); return String(h % 12 || 12).padStart(2, '0') + String(m).padStart(2, '0') + (h < 12 ? 'AM' : 'PM'); };
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
      'Check airport transfer options, luggage capacity, child seats, pickup details and the final total.'],
    ['minibuses', 'party bus minibus', 'Minibuses & party buses',
      'Group transport for stag, hen and birthday nights. Check seats, music, drinks rules and the final total.'],
    ['helicopters', 'helicopter', 'Helicopter flights',
      'Scenic flights and helicopter transfers where offered. Check weight limits, weather policy and meeting point.'],
    ['jets', 'private jet', 'Private jets & charter flights',
      'Private jet and charter options where a supplier lists them. Availability varies a lot by city.'],
    ['boats', 'private boat yacht charter', 'Boats & yacht charters',
      'Private boats, yachts and sunset cruises. Check group size, skipper, catering and cancellation terms.']
  ].map(([kind, query, serviceLabel, description]) => {
    const url = new URL('https://www.viator.com/searchResults/all');
    for (const [key, value] of Object.entries({text: d.search + ' ' + query, pid: 'P00333211', mcid: '42383', medium: 'link', campaign: 'tb-limos'})) url.searchParams.set(key, value);
    const noun = {limos: 'limos', chauffeurs: 'chauffeur cars', transfers: 'airport transfers', minibuses: 'minibuses & party buses',
      helicopters: 'helicopter flights', jets: 'private jets', boats: 'boat & yacht charters'}[kind];
    return {id: 'viator-' + kind, name: 'Search ' + d.city + ' ' + noun + ' on Viator',
      url: url.href, description, serviceLabel, commercial: 'affiliate'};
  });
}
const forkDomains = {GB: 'www.thefork.co.uk', PT: 'www.thefork.pt', ES: 'www.thefork.es', FR: 'www.thefork.fr', IT: 'www.thefork.it'};
export function directoryProviders(kind, country = '', city = '', trip = {}) {
  const d = tripDestination(country, city), t = tripDates(trip);
  switch (kind) {
    case 'stay': {
      const url = new URL('https://www.expedia.co.uk/Hotel-Search');
      if (d.search) url.searchParams.set('destination', d.search);
      if (t.from) url.searchParams.set('startDate', t.from);
      if (t.to) url.searchParams.set('endDate', t.to);
      if (t.adults) { url.searchParams.set('rooms', String(t.rooms)); for (const n of perRoom(t.adults, t.rooms)) url.searchParams.append('adults', String(n)); }
      const booking = new URL('https://www.booking.com/searchresults.en-gb.html');
      if (d.search) booking.searchParams.set('ss', d.search);
      if (t.from) booking.searchParams.set('checkin', t.from);
      if (t.to) booking.searchParams.set('checkout', t.to);
      if (t.adults) { booking.searchParams.set('group_adults', String(t.adults)); booking.searchParams.set('no_rooms', String(t.rooms)); booking.searchParams.set('group_children', '0'); }
      const ready = t.from && t.to;
      // Trip.com is the approved, tracked hotel partner; Expedia and Booking.com stay as
      // plain public searches so visitors can compare.
      return [
        ...tripcomStayProviders(d.country, d.city, trip),
        entry('expedia-hotels', 'Search hotels on Expedia', url.href, ready
          ? 'Opens Expedia with your city, dates and rooms filled in: see live prices, then book there.'
          : 'Choose your dates, guests, location and cancellation terms on Expedia.'),
        entry('booking-hotels', 'Search stays on Booking.com', booking.href, ready
          ? 'Opens Booking.com with the same search, so you can compare hotel and apartment prices.'
          : 'Compare hotels, apartments and guest houses; choose your dates on Booking.com.')
      ];
    }
    case 'travel': return [
      entry('trainline-direct', 'Search Trainline', 'https://www.thetrainline.com/', 'Compare available train and coach routes; enter your departure and destination.'),
      entry('omio-direct', 'Search Omio', 'https://www.omio.com/', 'Check train, coach and other travel options for your journey.')
    ];
    case 'car': {
      if (!d.city) return [entry('expedia-cars', 'Search car hire on Expedia', 'https://www.expedia.co.uk/Cars',
        'Choose pickup location and times, driver details and cover; check deposits, excess and fuel policy.')];
      const url = new URL('https://www.expedia.co.uk/carsearch');
      url.searchParams.set('locn', d.search);
      if (t.from) { url.searchParams.set('d1', t.from); url.searchParams.set('time1', ampm(t.pickup || '10:00')); }
      if (t.to) { url.searchParams.set('d2', t.to); url.searchParams.set('time2', ampm(t.dropoff || '10:00')); }
      return [entry('expedia-cars', 'Search car hire on Expedia', url.href, t.from && t.to
        ? 'Opens Expedia with your pickup place, dates and times filled in: compare cars and prices, then book there.'
        : 'Choose pickup location and times, driver details and cover; check deposits, excess and fuel policy.')];
    }
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
