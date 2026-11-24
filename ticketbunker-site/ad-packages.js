// Advertising on TicketBunker: one source for the Advertise page, checkout and the
// control room. Prices include VAT and are per week. Every booking is reviewed before
// it goes live; a booking we turn down is refunded in full.
export const AD_PACKAGES = Object.freeze({
  city: {label: 'City page banner', blurb: 'A full-width banner between the listings on one city page.', priceCents: {eur: 2900, gbp: 2900}, needsCity: true},
  home: {label: 'Homepage banner', blurb: 'A full-width banner between the homepage listings, seen by every visitor.', priceCents: {eur: 7900, gbp: 7900}, needsCity: false},
  everywhere: {label: 'Homepage + every city page', blurb: 'Your banner on the homepage and on all city pages in your country.', priceCents: {eur: 14900, gbp: 14900}, needsCity: false}
});
export const AD_WEEKS = Object.freeze([1, 2, 4, 8]);
// Longer bookings save a little: 4 weeks 10% off, 8 weeks 15% off.
export const AD_WEEK_DISCOUNT = Object.freeze({1: 0, 2: 0, 4: 10, 8: 15});
export const AD_COUNTRIES = Object.freeze(['GB', 'IE', 'PT', 'ES', 'FR', 'NL', 'DE', 'IT', 'CZ', 'AT', 'HU']);

export function adPrice(pkg, weeks, currency) {
  const plan = AD_PACKAGES[pkg];
  if (!plan || !AD_WEEKS.includes(weeks) || !['eur', 'gbp'].includes(currency)) return null;
  return Math.round(plan.priceCents[currency] * weeks * (100 - AD_WEEK_DISCOUNT[weeks]) / 100);
}

// Where a booking shows: 'home', or a city page slug. 'everywhere' covers the homepage
// and every city page in the booking's country.
export function adShowsOn(booking, place, cityCountry = '') {
  if (booking.package === 'home') return place === 'home';
  if (booking.package === 'city') return place !== 'home' && place === booking.city_slug;
  if (booking.package === 'everywhere') return place === 'home' || (!!cityCountry && cityCountry === booking.country_code);
  return false;
}
