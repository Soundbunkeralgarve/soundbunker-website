// My tickets: the same account, ticket list and signed ticket links as theticketbunker.com.
import {requestJson} from './request.js';
import {SITE} from './config.js';

// Ticket links look like https://theticketbunker.com/event-ticket?id=…&sig=…
export function ticketRef(url) {
  try {
    const u = new URL(url, SITE), id = u.searchParams.get('id'), sig = u.searchParams.get('sig');
    return id && sig ? {id, sig} : null;
  } catch { return null; }
}
// The QR the door scanner reads: identical to the one on the ticket web page.
export const admissionUrl = ({id, sig}) => SITE + '/event-ticket?id=' + encodeURIComponent(id) + '&sig=' + encodeURIComponent(sig);
export const walletUrl = ({id, sig}, provider) => SITE + '/api/event-wallet?id=' + encodeURIComponent(id) + '&sig=' + encodeURIComponent(sig) + '&provider=' + provider;

export function ticketStatus(t, now = Date.now()) {
  if (t.used) return 'CHECKED IN';
  if (Date.parse(t.startsAt) < now) return 'PAST EVENT';
  return 'YOUR ADMISSION';
}
// Upcoming first (soonest), then past events (most recent).
export function sortTickets(list, now = Date.now()) {
  const at = t => Date.parse(t.startsAt) || 0;
  return [...list].sort((a, b) => {
    const pa = at(a) < now, pb = at(b) < now;
    return Number(pa) - Number(pb) || (pa ? at(b) - at(a) : at(a) - at(b));
  });
}

export async function myTickets(token, fetcher = fetch) {
  const d = await requestJson(SITE + '/api/my-event-tickets', {headers: {authorization: 'Bearer ' + token}}, fetcher, 30000);
  return Array.isArray(d.tickets) ? d.tickets : [];
}
export async function ticketDetail(ref, fetcher = fetch) {
  const d = await requestJson(SITE + '/api/event-ticket?id=' + encodeURIComponent(ref.id) + '&sig=' + encodeURIComponent(ref.sig), {}, fetcher, 30000);
  if (d.ticket?.test && !d.ticket.walletTest) throw Error('This ticket is not valid for admission.');
  return d.ticket;
}
// Google Wallet hands back a save link; only Google's own save page is opened.
export async function googleWalletLink(ref, fetcher = fetch) {
  const d = await requestJson(walletUrl(ref, 'google'), {}, fetcher, 30000);
  if (!String(d.url || '').startsWith('https://pay.google.com/gp/v/save/')) throw Error('Google Wallet is not available for this ticket.');
  return d.url;
}
