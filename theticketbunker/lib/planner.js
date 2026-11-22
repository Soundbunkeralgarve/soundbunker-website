// "Make a night of it", as on the site's night planner (ticketbunker-site/night-planner.js):
// tickets first, then getting there, a bed, food and extras. Each books on the partner's own
// site; steps without an approved partner say "Coming soon". The site module also drives the
// page's dialog, so its plan logic is mirrored here; partner links and directions are shared.
import {tripOptions, withClickRef, directionLinks, gygPlace, GYG_PLACES} from './site.js';
import {siteUrl} from './config.js';

const MAX = 12, GYG_PARTNER = 'KNICMG4', PAGE = 'app';

export function tourLink(city, country) {
  if (!city) return '';
  const key = gygPlace({city, country});
  return key ? `https://www.getyourguide.com/${key}-l${GYG_PLACES[key]}/?partner_id=${GYG_PARTNER}&cmp=app-planner`
    : `https://www.getyourguide.com/s/?q=${encodeURIComponent(city)}&partner_id=${GYG_PARTNER}&cmp=app-planner`;
}
export const ticketLink = (item, spot = 'planner') => item.external ? withClickRef(item.url, PAGE, spot) : siteUrl(item.url);

export function plannerSteps(item) {
  const city = item.city || '', country = item.countryCode || '';
  const options = Object.fromEntries(tripOptions(country, city, {page: PAGE, spot: 'planner'}).map(o => [o.kind, o]));
  const partnerStep = (kind, label, blurb) => ({kind, label, blurb, links: options[kind]?.partners || []});
  const tours = tourLink(city, country);
  return [
    {kind: 'tickets', label: 'Tickets', blurb: item.external ? `Booked on ${item.seller}. Fees may apply.` : 'No booking fee with TicketBunker.', links: [{name: item.external ? item.seller : 'TicketBunker', url: ticketLink(item)}]},
    {kind: 'route', label: 'Get to the venue', blurb: item.venue ? `Directions to ${item.venue} from where you are.` : 'Directions from where you are.', links: directionLinks(item)},
    partnerStep('travel', city ? `Travel to ${city}` : 'Travel there', 'Trains, coaches and ferries.'),
    partnerStep('stay', 'Stay nearby', item.venue ? `Hotels close to ${item.venue}.` : 'Hotels close to the venue.'),
    partnerStep('eat', 'Eat nearby', 'Food deals before or after.'),
    {kind: 'tours', label: 'Things to do', blurb: 'Tours and day trips while you are there.', links: tours ? [{name: 'GetYourGuide', url: tours}] : []}
  ];
}

// My trip: a short list of saved nights, soonest first, past ones dropped.
export function tidyTrip(list, now = Date.now()) {
  return (Array.isArray(list) ? list : []).filter(n => n && n.id && (!n.startsAt || Date.parse(n.startsAt) > now - 864e5))
    .sort((a, b) => (Date.parse(a.startsAt) || Infinity) - (Date.parse(b.startsAt) || Infinity)).slice(0, MAX);
}
export const nightId = item => item.key || item.id || item.url;
export function saveNight(list, item, now = Date.now()) {
  const id = nightId(item), keep = list.find(n => n.id === id);
  const night = {id, title: item.title, startsAt: item.startsAt || '', timezone: item.timezone || '', city: item.city || '',
    countryCode: item.countryCode || '', venue: item.venue || '', seller: item.seller || '', url: item.url, external: Boolean(item.external),
    address: item.address || '', image: item.image || '', category: item.category || '', priceCents: item.priceCents ?? null, currency: item.currency || '',
    ...(Number.isFinite(item.lat) && Number.isFinite(item.lng) ? {lat: item.lat, lng: item.lng} : {}),
    done: {...(keep?.done || {})}};
  return tidyTrip([night, ...list.filter(n => n.id !== id)], now);
}
export const removeNight = (list, id) => list.filter(n => n.id !== id);
export const markStep = (list, id, kind, done = true) => list.map(n => n.id === id ? {...n, done: {...n.done, [kind]: done}} : n);
