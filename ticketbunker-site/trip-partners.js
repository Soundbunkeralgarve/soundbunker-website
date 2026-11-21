// "Plan your trip": travel, places to stay and food partners shown on city pages.
// A partner only becomes a live button once its programme has approved us (approved: true);
// until then the column says "Coming soon" so nothing is promised that cannot be booked.
// Awin links use Awin's own click tracker with our publisher ID (public, not a secret).
const AWIN_AFFILIATE = 3163272;
export const awinLink = (merchant, destination) =>
  `https://www.awin1.com/cread.php?awinmid=${merchant}&awinaffid=${AWIN_AFFILIATE}&ued=${encodeURIComponent(destination)}`;

// [kind, name, countries it serves ('*' = everywhere), approved, link(cityName)]
export const TRIP_PARTNERS = Object.freeze([
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
export const TRIP_KINDS = Object.freeze([['travel', 'Get there', 'Trains, coaches and ferries to the show.'], ['stay', 'Stay nearby', 'Hotels close to the venue.'], ['eat', 'Eat nearby', 'Discounts on food before or after.']]);

export function tripOptions(country, city) {
  return TRIP_KINDS.map(([kind, label, blurb]) => ({kind, label, blurb,
    partners: TRIP_PARTNERS.filter(([k, , countries, approved]) => k === kind && approved && (countries.includes('*') || countries.includes(country)))
      .map(([, name, , , link]) => ({name, url: link(city)}))}));
}
