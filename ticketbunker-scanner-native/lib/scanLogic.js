// Native requests go straight to the existing authenticated ticket service.
export const API_BASE = 'https://www.soundbunker.pt';
export const TICKET_HOSTS = new Set(['theticketbunker.com','www.theticketbunker.com','soundbunker.pt','www.soundbunker.pt']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function ticketUrl(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) throw Error('Invalid ticket QR.');
  let parsed;
  try { parsed = new URL(raw.trim()); } catch { throw Error('Not a TicketBunker ticket QR.'); }
  if (parsed.protocol !== 'https:' || !TICKET_HOSTS.has(parsed.hostname.toLowerCase()) || !['/event-ticket','/event-ticket.html'].includes(parsed.pathname) || !UUID.test(parsed.searchParams.get('id')||'') || !/^[a-f0-9]{64}$/i.test(parsed.searchParams.get('sig')||'')) {
    throw Error('This is not a valid TicketBunker ticket QR.');
  }
  return parsed.toString();
}
export function inviteToken(raw) {
  if (typeof raw !== 'string' || raw.length > 4096) return null;
  const text=raw.trim();
  if (/^[a-f0-9]{64}$/i.test(text)) return text.toLowerCase();
  try {
    const u=new URL(text);
    if (u.protocol !== 'https:' || !TICKET_HOSTS.has(u.hostname.toLowerCase()) || u.pathname !== '/event-scanner') return null;
    const token=u.searchParams.get('invite')||'';
    return /^[a-f0-9]{64}$/i.test(token)?token.toLowerCase():null;
  } catch {return null;}
}
export function admissionResult(result) {
  if (!result || typeof result !== 'object') return {kind:'rejected',heading:'SCAN ERROR',detail:'Unknown admission response'};
  if (result.status==='valid' && result.test===true) return {kind:'warning',heading:'TEST CHECK-IN ACCEPTED',detail:'Test successful. This ticket is now checked in. Private rehearsal only — not public admission.'};
  if (result.status==='valid')return {kind:'approved',heading:'ENTRY APPROVED',detail:[result.event,result.tier].filter(Boolean).join(' · ')};
  if (result.status==='used')return {kind:'warning',heading:'ALREADY SCANNED',detail:result.message||'This ticket has already been admitted.'};
  if (result.status==='wrong_lane')return {kind:'warning',heading:'USE ANOTHER LANE',detail:result.message};
  if (result.status==='offline_reserved')return {kind:'warning',heading:'USE OFFLINE LANE',detail:result.message};
  if (result.status==='wrong_event')return {kind:'rejected',heading:'WRONG EVENT',detail:result.message||'Not valid for this event.'};
  return {kind:'rejected',heading:'ENTRY REJECTED',detail:result.message||'This QR cannot be admitted.'};
}
