// Display-only SAMPLE listings that show how each homepage rail looks while real
// events and approved partner tickets are added. Never bookable, never counted as
// results, and every card is labelled SAMPLE. Venues and line-ups are fictional.
const DAY = 864e5;
const at = (days, hour, zone = 'Europe/Lisbon') => {
  const d = new Date(Date.now() + days * DAY);
  // Approximate local time: good enough for illustrative dates.
  const offset = zone === 'Europe/Paris' || zone === 'Europe/Madrid' ? 1 : 0;
  d.setUTCHours(hour - offset, 0, 0, 0);
  return d.toISOString();
};
const PT = ['PT', 'eur', 'Europe/Lisbon'], GB = ['GB', 'gbp', 'Europe/London'], IE = ['IE', 'eur', 'Europe/Dublin'],
  FR = ['FR', 'eur', 'Europe/Paris'], ES = ['ES', 'eur', 'Europe/Madrid'];
const s = (id, category, title, city, [countryCode, currency, timezone], days, hour, price, image, venue) => ({
  key: 'sample:' + id, source: 'sample', sample: true, title, category, kind: '', city, venue,
  countryCode, currency, timezone, startsAt: days === null ? '' : at(days, hour, timezone), endsAt: '',
  priceCents: price, soldOut: false, featured: false, image, organiser: '', url: '', seller: 'Sample', external: false, bookable: false
});
const img = name => '/assets/samples/' + name + '.jpg';

export const sampleListings = Object.freeze([
  // Live music
  s('m1', 'music', 'Velvet Static — Live', 'Faro', PT, 2, 21, 1800, '/assets/hero-live-v2.webp', 'Harbour Warehouse'),
  s('m2', 'music', 'The Long Coast Tour', 'Lisbon', PT, 5, 21, 2500, '/assets/band.webp', 'Riverside Hall'),
  s('m3', 'music', 'Northern Lights Session', 'Manchester', GB, 9, 20, 2200, '/assets/crowd.jpg', 'Mill Yard'),
  s('m4', 'music', 'Saltwater Choir', 'Lagos', PT, 12, 21, 1500, img('festival-hands'), 'Old Fort Courtyard'),
  s('m5', 'music', 'Midnight Brass Collective', 'Edinburgh', GB, 16, 20, 2000, img('festival-field'), 'Vault Rooms'),
  // Raves & club nights
  s('c1', 'club', 'Bunker Sessions: Warehouse 001', 'Albufeira', PT, 1, 23, 2000, '/assets/club.jpg', 'Strip Warehouse'),
  s('c2', 'club', 'Deep Tide All Night Long', 'Lisbon', PT, 6, 23, 2500, '/assets/hero-club-v2.webp', 'Dockside Club'),
  s('c3', 'club', 'Acid Basement', 'London', GB, 8, 22, 2200, '/assets/dj.webp', 'Arches Basement'),
  s('c4', 'club', 'Red Room All-Nighter', 'Vilamoura', PT, 13, 23, 3000, img('rave-party'), 'Marina Terrace'),
  s('c5', 'club', 'Techno Under the City', 'Barcelona', ES, 20, 23, 2800, img('rave-lights'), 'Port Tunnel'),
  // Festivals
  s('f1', 'festival', 'Coastline Weekender', 'Portimão', PT, 27, 14, 8900, img('festival-field'), 'Riverside Fields'),
  s('f2', 'festival', 'Oak & Ember Festival', 'Edinburgh', GB, 41, 12, 7500, '/assets/festival.webp', 'Parkland Bowl'),
  s('f3', 'festival', 'Algarve Sound Garden', 'Loulé', PT, 48, 15, 6500, img('festival-hands'), 'Hilltop Estate'),
  s('f4', 'festival', 'City Lights Day Festival', 'Dublin', IE, 55, 13, 5900, '/assets/crowd.jpg', 'Quayside Park'),
  // Comedy
  s('k1', 'comedy', 'Stand-Up in the Bunker', 'Faro', PT, 3, 21, 1200, '/assets/comedy.jpg', 'Cellar Bar'),
  s('k2', 'comedy', 'Late Laughs Showcase', 'London', GB, 4, 20, 1500, img('comedy-mic'), 'Corner Theatre Bar'),
  s('k3', 'comedy', 'English Comedy Night', 'Lisbon', PT, 10, 21, 1400, img('comedy-spot'), 'Bairro Stage'),
  // Theatre & shows
  s('t1', 'shows', 'Shadows: A Physical Theatre Piece', 'Lisbon', PT, 7, 20, 2400, img('theatre'), 'Studio Theatre'),
  s('t2', 'shows', 'Cabaret After Dark', 'London', GB, 11, 20, 3200, img('theatre-curtain'), 'Velvet Room'),
  s('t3', 'shows', 'Fado & Stories', 'Tavira', PT, 14, 21, 1800, img('theatre-gold'), 'Old Town Hall'),
  s('t4', 'shows', 'Improv Night', 'Manchester', GB, 18, 20, 1200, img('comedy-mic'), 'Basement Stage'),
  // Cinema
  s('n1', 'cinema', 'Classic Night: Big Screen Revival', 'Lisbon', PT, 2, 21, 900, img('cinema'), 'Grand Screen'),
  s('n2', 'cinema', 'Open-Air Cinema by the Sea', 'Albufeira', PT, 5, 21, 1200, img('open-air-cinema'), 'Beach Screen'),
  s('n3', 'cinema', 'Late-Night Horror Double Bill', 'London', GB, 6, 22, 1400, img('cinema-2'), 'Picture House'),
  s('n4', 'cinema', 'Cult Classics Club', 'Paris', FR, 9, 21, 1500, img('projector'), 'Small Screen Club'),
  // Boat trips
  s('b1', 'boat', 'Cave & Grotto Boat Tour', 'Lagos', PT, null, 0, 3500, img('boat-caves'), 'Marina departure'),
  s('b2', 'boat', 'Dolphin Watching Trip', 'Albufeira', PT, null, 0, 4500, img('dolphins'), 'Marina departure'),
  s('b3', 'boat', 'Benagil Coast Cruise', 'Portimão', PT, null, 0, 3000, img('boat-rocks'), 'Riverside pier'),
  // Experiences & days out
  s('e1', 'daysout', 'Sea Kayak Coast Adventure', 'Lagos', PT, null, 0, 3000, img('kayak'), 'Beach meeting point'),
  s('e2', 'daysout', 'Beginner Surf Lesson', 'Sagres', PT, null, 0, 3500, img('surf'), 'Surf school'),
  s('e3', 'daysout', 'Water Park Day Pass', 'Albufeira', PT, null, 0, 3200, img('water-park'), 'Water park'),
  s('e4', 'daysout', 'Wine Tasting Afternoon', 'Lagoa', PT, null, 0, 2800, img('wine'), 'Hillside winery'),
  s('e5', 'daysout', 'Aquarium Day Ticket', 'Lisbon', PT, null, 0, 2200, img('aquarium'), 'City aquarium')
]);

// Rails shown on the homepage, in order. Native kinds map onto these categories.
export const homeRails = Object.freeze([
  ['music', 'Live music', 'Gigs and live sets.'],
  ['club', 'Raves & club nights', 'Warehouses, basements and terraces.'],
  ['festival', 'Festivals', 'Weekenders and day festivals.'],
  ['comedy', 'Comedy', 'Stand-up and showcases.'],
  ['shows', 'Theatre & shows', 'Stage, cabaret and performance.'],
  ['cinema', 'Cinema', 'Big screens, open air and late nights.'],
  ['boat', 'Boat trips', 'Caves, coastlines and dolphins.'],
  ['daysout', 'Experiences & days out', 'Kayaks, surf, water parks and more.']
]);
