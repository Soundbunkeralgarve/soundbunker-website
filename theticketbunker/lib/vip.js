// TicketBunker VIP in the app: membership status, "tell me when it opens" and claiming
// VIP guestlist spots, through the same /api/ticketbunker-vip as theticketbunker.com/vip.
// Joining (a paid subscription) is not sold inside the app; see README "VIP and the stores".
import {requestJson} from './request.js';
import {SITE} from './config.js';

const vipUrl = SITE + '/api/ticketbunker-vip';
const auth = token => ({authorization: 'Bearer ' + token});
export const vipStatus = (token, fetcher = fetch) => requestJson(vipUrl, {headers: auth(token)}, fetcher, 20000);
export const vipInterest = (token, fetcher = fetch) =>
  requestJson(vipUrl, {method: 'POST', headers: {...auth(token), 'content-type': 'application/json'}, body: JSON.stringify({action: 'interest'})}, fetcher, 20000);

// One request id per claim attempt, so a retried tap never makes a second pass.
export function newRequestId() {
  const h = n => Array.from({length: n}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${h(3)}-${h(12)}`;
}
export async function claimSpot(token, allocationId, {requestId = newRequestId(), name = ''} = {}, fetcher = fetch) {
  try {
    return await requestJson(vipUrl, {method: 'POST', headers: {...auth(token), 'content-type': 'application/json'},
      body: JSON.stringify({action: 'guestlist', allocationId, requestId, ...(name ? {name} : {})})}, fetcher, 30000);
  } catch (e) {
    if (/name/i.test(e.message) && !name) throw Object.assign(e, {needName: true, requestId});
    throw e;
  }
}
export function memberLine(v) {
  if (!v?.member) return '';
  const day = iso => { try { return new Intl.DateTimeFormat('en-GB', {day: 'numeric', month: 'long', year: 'numeric'}).format(new Date(iso)); } catch { return ''; } };
  const when = v.renewsOn ? `Renews ${day(v.renewsOn)}.` : v.endsOn ? `VIP until ${day(v.endsOn)}.` : '';
  return ['You’re a TicketBunker VIP.', when, v.status === 'past_due' ? 'Your last payment didn’t go through; update your card on theticketbunker.com to keep VIP.' : ''].filter(Boolean).join(' ');
}
// Our own events can open to VIP members first; the note shows only while that window is open.
export function earlyAccessUntil(item, now = Date.now()) {
  const until = item?.raw?.vip_presale_until;
  return until && Date.parse(until) > now ? until : '';
}
