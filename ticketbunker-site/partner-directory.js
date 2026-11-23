import {awinLink, withClickRef} from './trip-partners.js?v=20261123';
import {CITY_PAGES} from './city-places.js?v=20261122';

// Approved Entradas.com affiliate directory. These are supplier browse pages,
// not an event feed or inventory available through TicketBunker's checkout.
const MERCHANT = 24761;
const ORIGIN = 'https://www.entradas.com';
const CITIES = Object.freeze([
  {key: 'madrid', label: 'Madrid', path: '/city/madrid-370/'},
  {key: 'barcelona', label: 'Barcelona', path: '/city/barcelona-371/'},
  {key: 'malaga', label: 'Málaga', path: '/city/malaga-490/'},
  {key: 'sevilla', label: 'Seville', path: '/city/sevilla-380/'}
]);
const norm = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');
const alias = value => ({seville: 'sevilla'}[norm(value)] || norm(value));
const cityCountries = new Map(CITY_PAGES.flatMap(([slug, label, country, query]) =>
  [slug, label.replace(/^the /i, ''), query].map(value => [alias(value), country])));

export function partnerDirectory({country = '', city = ''} = {}, {page = 'home'} = {}) {
  const cc = String(country || '').trim().toUpperCase(), key = alias(city);
  if (cc && cc !== 'ES') return null;
  const knownCountry = cityCountries.get(key);
  if (key && knownCountry && knownCountry !== 'ES') return null;
  const match = CITIES.find(place => place.key === key);
  if (key && !cc && !match && knownCountry !== 'ES') return null;
  const selected = match ? [match] : key ? [] : CITIES;
  const entries = selected.map(place => ({label: place.label, destination: ORIGIN + place.path}));
  if (!match) entries.push({label: 'All Spain', destination: ORIGIN + '/'});
  return {
    heading: 'More events in Spain',
    description: match ? `Explore the ${match.label} directory on entradas.com.` : 'Browse entradas.com for concerts, shows and more across Spain.',
    links: entries.map(entry => ({...entry, url: withClickRef(awinLink(MERCHANT, entry.destination), page, 'partner-directory')}))
  };
}

export function renderPartnerDirectory(section, state, options) {
  if (!section) return;
  const directory = partnerDirectory(state, options);
  section.hidden = !directory;
  if (!directory) return;
  section.querySelector('[data-directory-heading]').textContent = directory.heading;
  section.querySelector('[data-directory-description]').textContent = directory.description;
  const links = directory.links.map(({label, url}) => {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'sponsored noopener noreferrer';
    a.textContent = label;
    a.setAttribute('aria-label', `${label}: browse on entradas.com (opens in a new tab)`);
    return a;
  });
  section.querySelector('[data-directory-links]').replaceChildren(...links);
}
