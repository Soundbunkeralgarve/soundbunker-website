// Partner bookings are account records, never TicketBunker admission tickets.
import {requestJson} from './request.js';
import {SITE} from './config.js';

export const partnerAccountUrl = SITE + '/my-tickets';

export async function myPartnerBookings(token, fetcher = fetch) {
  const data = await requestJson(SITE + '/api/partner-bookings', {
    headers: {authorization: 'Bearer ' + token}
  }, fetcher, 30000);
  return Array.isArray(data.bookings) ? data.bookings : [];
}

export function partnerBookingStatus(booking) {
  if (booking?.verificationSource === 'provider' && booking.status === 'provider_confirmed')
    return {label: 'Confirmed by supplier', note: 'Use the supplier’s current ticket for admission.'};
  if (booking?.verificationSource === 'provider' && booking.status === 'cancelled')
    return {label: 'Cancelled by supplier', note: 'Check your booking with the supplier for updates and refunds.'};
  if (booking?.status === 'customer_added')
    return {label: 'Added by you', note: 'Not verified by the supplier.'};
  return {label: 'Saved link · unconfirmed', note: 'Opening a link does not confirm a purchase.'};
}

// Only regular public HTTPS pages can be opened from supplier-supplied metadata.
// This does not assert that an external booking or admission ticket is valid.
export function partnerBookingUrl(value) {
  try {
    const url = new URL(value), host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !host.includes('.') || host.endsWith('.') || host.includes(':') ||
        /^\d+(?:\.\d+){3}$/.test(host) ||
        /(^|\.)(localhost|local|internal|test|invalid)$/.test(host)) return '';
    return url.href;
  } catch { return ''; }
}
