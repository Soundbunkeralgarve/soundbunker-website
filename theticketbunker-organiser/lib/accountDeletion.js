// "Delete my account" (Apple App Store guideline 5.1.1(v)). The app opens an account
// deletion case in TicketBunker support with the signed-in account; the owner completes it
// in the support inbox (Support admin) and the case reference is shown to the person.
import {requestJson} from './request.js';
import {SITE} from './config.js';

export const DELETION_DAYS = 30;
// What is deleted and what the law or open bookings make us keep, in plain words.
export const DELETION_TERMS = Object.freeze([
  'Your sign-in, name, contact details and preferences are deleted.',
  'Tickets for events that have already happened are anonymised.',
  'Tickets for upcoming events stay valid until the event, unless you ask us to cancel them.',
  'Records we must keep by law (payments, invoices, organiser payouts and tax) are kept only for as long as the law requires.',
  'An active TicketBunker VIP membership is cancelled; it is not refunded for the current period.'
]);
const uuid = () => { const h = n => Array.from({length: n}, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${h(3)}-${h(12)}`; };

export function deletionRequest(email, app, reason = '') {
  const note = String(reason || '').trim().slice(0, 1000);
  return {action: 'create', clientRequestId: uuid(), category: 'general', subject: 'Account deletion request',
    body: [`Please delete my TicketBunker account (${email}) and its personal data.`, `Requested in the ${app} app.`,
      `Complete within ${DELETION_DAYS} days as described in the app.`, note && 'Reason: ' + note].filter(Boolean).join('\n')};
}
export async function requestAccountDeletion(token, email, app, reason = '', fetcher = fetch) {
  const d = await requestJson(SITE + '/api/ticketbunker-support', {method: 'POST',
    headers: {authorization: 'Bearer ' + token, 'content-type': 'application/json'}, body: JSON.stringify(deletionRequest(email, app, reason))}, fetcher, 30000);
  return {reference: d.case?.reference || d.reference || '', message: d.message || 'Your request is saved.'};
}
