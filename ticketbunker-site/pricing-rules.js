// Advertised organiser totals include applicable VAT. EUR tax examples use PT IVA at 23%.
export const plans=Object.freeze({
 starter:{label:'Starter',capacity:100,eur:9900,gbp:9900},
 standard:{label:'Standard',capacity:500,eur:19900,gbp:19900},
 headline:{label:'Headline',capacity:1000,eur:29900,gbp:29900},
 event_plus:{label:'Event Plus',capacity:2000,eur:39900,gbp:39900}
});
export const largeEventDeposit=Object.freeze({eur:39900,gbp:39900});
export const largeEventThreshold=2000;
export const bundleRate=count=>count===4?.05:count===8?.10:0;
export const additionalTicketRate=currency=>15;
export const taxExample=cents=>{const netCents=Math.round(cents/1.23);return {netCents,taxCents:cents-netCents,totalCents:cents};};
export function usageQuote(currency,paidTickets){
 if(!['eur','gbp'].includes(currency)||!Number.isSafeInteger(paidTickets)||paidTickets<0)throw Error('Invalid paid-ticket count');
 const baseCents=largeEventDeposit[currency],rateCents=additionalTicketRate(currency),billableTickets=Math.max(0,paidTickets-largeEventThreshold),settlementFeeCents=billableTickets*rateCents;
 if(!Number.isSafeInteger(baseCents+settlementFeeCents))throw Error('Ticket count is too large');
 return {currency,baseCents,rateCents,includedTickets:largeEventThreshold,billableTickets,settlementFeeCents,totalCents:baseCents+settlementFeeCents};
}

// Saved quotes retain their own allowance; older quotes included no tickets.
export function reservationUsageTerms(reservation){
 if(!reservation.rate_cents)return '';
 const included=reservation.included_tickets||0;
 return included?'upfront deposit covering the first '+included.toLocaleString('en-GB')+' paid tickets; '+(reservation.currency==='gbp'?'£':'€')+(reservation.rate_cents/100).toFixed(2)+' per additional paid ticket, deducted at organiser payout':'upfront setup plus '+(reservation.currency==='gbp'?'£':'€')+(reservation.rate_cents/100).toFixed(2)+' per paid ticket from the first sale (previous quote terms)';
}
