// "Get me there": hand the trip to the apps people already use. Google Maps works out
// walking and public transport (bus, train, tram, metro) from wherever the visitor is;
// Uber opens with pickup at their location. Nothing about the visitor is sent to us.
const enc = encodeURIComponent;
// Cities Citymapper covers that also have TicketBunker city pages.
const CITYMAPPER = ['london', 'manchester', 'birmingham', 'dublin', 'paris', 'lyon', 'barcelona', 'madrid', 'lisbon', 'amsterdam',
  'brussels', 'berlin', 'hamburg', 'munich', 'milan', 'rome', 'vienna', 'copenhagen', 'stockholm'];

export function destinationText({venue = '', address = '', city = ''} = {}) {
  const parts = [venue, address || city].map(v => String(v || '').trim()).filter(Boolean);
  // Addresses often already end with the town; don't say it twice.
  return [...new Set(parts)].join(', ');
}

export function directionLinks(place = {}) {
  const to = destinationText(place);
  if (!to) return [];
  const maps = mode => `https://www.google.com/maps/dir/?api=1&destination=${enc(to)}&travelmode=${mode}`;
  const links = [
    // dir_action=navigate starts turn-by-turn walking straight away on phones.
    {kind: 'walk', name: 'Walk me there', url: maps('walking') + '&dir_action=navigate'},
    {kind: 'transit', name: 'Bus, train & metro', url: maps('transit')}
  ];
  // Uber sets the drop-off exactly from a map point (from the venue postcode); without one
  // it still gets the venue name and address to match.
  const exact = Number.isFinite(place.lat) && Number.isFinite(place.lng) ? `&dropoff[latitude]=${place.lat}&dropoff[longitude]=${place.lng}` : '';
  links.push({kind: 'taxi', name: 'Uber', url: 'https://m.uber.com/ul/?action=setPickup&pickup=my_location' + exact
    + `&dropoff[nickname]=${enc(place.venue || to)}&dropoff[formatted_address]=${enc(place.address || to)}`});
  const city = String(place.city || '').toLowerCase();
  // Citymapper is the best metro planner where it runs; it takes the venue name and address.
  if (CITYMAPPER.some(c => city.includes(c))) {
    links.push({kind: 'citymapper', name: 'Citymapper', url: `https://citymapper.com/directions?endname=${enc(place.venue || to)}&endaddress=${enc(to)}`
      + (Number.isFinite(place.lat) && Number.isFinite(place.lng) ? `&endcoord=${place.lat}%2C${place.lng}` : '')});
  }
  if (/\blondon\b/.test(city)) links.push({kind: 'tube', name: 'Tube map', url: 'https://tfl.gov.uk/maps/track/tube'});
  return links;
}

// Rough times from the visitor to the venue, worked out on the phone from straight-line
// distance (streets add about a third). Labelled "about"; the map apps give exact times.
export function travelEstimates([lat1, lon1], [lat2, lon2]) {
  const r = Math.PI / 180, a = Math.sin((lat2 - lat1) * r / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin((lon2 - lon1) * r / 2) ** 2;
  const km = 12742 * Math.asin(Math.sqrt(a));
  return {km, walkMin: Math.max(1, Math.round(km * 1.3 / 4.8 * 60)), carMin: Math.max(2, Math.round(km * 1.4 / 22 * 60) + 2)};
}
export function estimateText({km, walkMin, carMin}) {
  const dist = km < 1 ? Math.round(km * 1000 / 50) * 50 + ' m' : (km < 10 ? km.toFixed(1) : Math.round(km)) + ' km';
  const mins = m => m < 60 ? m + ' min' : (Math.floor(m / 60) + ' h ' + (m % 60 ? m % 60 + ' min' : '')).trim();
  // Walking stops being a sensible suggestion past about an hour.
  return [walkMin <= 75 && 'about ' + mins(walkMin) + ' walk', 'about ' + mins(carMin) + ' by taxi', dist + ' away'].filter(Boolean).join(' · ');
}
