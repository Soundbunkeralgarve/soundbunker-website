import {directoryProviders} from './travel-directory.js';
// Add only confirmed, publicly distributable vouchers with complete redemption terms.
// NOS corporate cinema codes and pending tastecard/TheFork affiliate applications are excluded.
export const VOUCHER_OFFERS = Object.freeze([]);
export function cityBenefits(city, vouchers = VOUCHER_OFFERS, now = Date.now()) {
  const [slug, name, country] = city;
  const publicOffers = directoryProviders('eat', country, name.replace(/^the /, '')).filter(p => p.id === 'thefork-direct').map(p => ({
    type:'provider-offers', title:'Check current restaurant offers on TheFork', url:p.url,
    description:`Choose ${name.replace(/^the /, '')}, your date and party size on TheFork to see whether participating restaurants have an offer.`,
    terms:'Offers vary by restaurant, date, time and menu. Read the offer conditions before booking. No TicketBunker voucher code is required.'
  }));
  const confirmed = vouchers.filter(v => v.approved === true && v.publicDistribution === true && v.title && v.terms &&
    Number.isFinite(Date.parse(v.validUntil)) && Date.parse(v.validUntil) > now &&
    (!v.cities?.length || v.cities.includes(slug)) && (!v.countries?.length || v.countries.includes(country)) &&
    (() => { try { const u = new URL(v.url); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; } })()
  ).map(v => ({...v,type:'voucher'}));
  return [...confirmed, ...publicOffers];
}
