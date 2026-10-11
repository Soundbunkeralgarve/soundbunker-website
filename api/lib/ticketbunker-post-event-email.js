// TicketBunker final event report is a transactional email, not a marketing campaign.
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const local=(date,zone)=>date?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:zone||'Europe/Lisbon'}).format(new Date(date)):'Not specified';
export const displayAmount=(cents,currency)=>new Intl.NumberFormat('en-GB',{style:'currency',currency:currency==='gbp'?'GBP':'EUR'}).format(Number(cents||0)/100);
export function describeVerifiedPayout(report,payout){
 if(report.paidTickets===0)return {heading:'No payout applicable',detail:'Only €0 system-test tickets were recorded. No payment is due or on its way.'};
 if(!payout)return {heading:'Stripe payout not yet confirmed',
  detail:'Ticket revenue is recorded, but no event-specific bank payout has been confirmed by Stripe. Normal bank payouts follow the organiser’s Stripe schedule (often a few business days after funds become available). Fast payouts are available only for eligible accounts.'};
 const method=payout.method==='instant'?'Fast':'Standard';
 const amount=displayAmount(payout.amount_cents,payout.currency||report.currency);
 const eta=payout.arrival_estimate_at?' Stripe estimated arrival: '+local(payout.arrival_estimate_at,report.venueTimezone)+'.':'';
 if(payout.status==='paid')return {heading:method+' payout marked paid by Stripe',detail:'Stripe marks '+amount+' as paid.'+(payout.paid_at?' Date: '+local(payout.paid_at,report.venueTimezone)+'.':'')+' Bank posting times may vary.'};
 if(payout.status==='in_transit')return {heading:method+' payout on its way',detail:'Stripe confirms '+amount+' is in transit.'+eta+' Same-day arrival is not guaranteed unless shown by Stripe.'};
 if(payout.status==='pending')return {heading:method+' payout pending',detail:'Stripe has initiated '+amount+', but it is not yet in transit.'+eta};
 return {heading:'Payout '+payout.status,detail:'Stripe reports the event-linked payout as '+payout.status+'. Check the Stripe Dashboard for next steps.'};
}
export function buildFinalEventReportEmail({report,payout,organiserName,eventUrl}){
 const zone=report.venueTimezone||'Europe/Lisbon',paid=Number(report.paidTickets||0),test=Number(report.testTickets||0);
 const scanned=Number(report.checkedIn||0),total=paid+test,noShows=Number(report.paidNotCheckedIn||0)+Number(report.testNotCheckedIn||0);
 const payoutText=describeVerifiedPayout(report,payout);
 const rows=[
  ['Total tickets issued',total],['Paid tickets sold',paid],['€0 test tickets',test],
  ['QR codes scanned',scanned],['Not checked in',noShows],
  ['Paid ticket revenue',displayAmount(report.revenueCents,report.currency)]
 ];
 const tierLines=(report.ticketsByType||[]).map(t=>t.name+': '+(t.paidTickets+t.testTickets)+' issued; '+(t.paidCheckedIn+t.testCheckedIn)+' checked in');
 const staffLines=(report.scannedByStaff||[]).map(s=>s.name+': '+s.total+' scans ('+s.paid+' paid, '+s.test+' test)');
 const text='TICKETBUNKER · EVENT REPORT\n\n'+
  'Hello '+organiserName+',\n\nHere is the report for '+report.title+', scheduled for 12 hours after the event ends.\n'+
  'Finished: '+local(report.endsAt,zone)+' · '+report.venue+'\n\n'+
  rows.map(([k,v])=>k+': '+v).join('\n')+
  '\n\nBY TICKET TYPE\n'+(tierLines.join('\n')||'No ticket types')+
  '\n\nSCANNER STAFF\n'+(staffLines.join('\n')||'No recorded scans')+
  '\n\nPAYOUT STATUS: '+payoutText.heading+'\n'+payoutText.detail+
  '\n\nTicket revenue counts all confirmed paid tickets, scanned or not. €0 test tickets are excluded from revenue.\n'+
  'Full dashboard: '+eventUrl+'\n\nTicketBunker';
 const table=rows.map(([k,v])=>'<tr><td style="padding:11px;border-bottom:1px solid #e9e2ef;color:#695b71;font-size:12px">'+esc(k)+'</td><td style="padding:11px;border-bottom:1px solid #e9e2ef;text-align:right;font-weight:800;color:#25182e">'+esc(v)+'</td></tr>').join('');
 const section=(heading,lines)=>'<div style="padding:17px;background:#f7f3f8;border:1px solid #e6ddea;border-radius:12px;margin:16px 0"><strong style="color:#302138">'+esc(heading)+'</strong><p style="color:#685a70;font-size:13px;line-height:1.7;margin:9px 0 0">'+(lines.length?lines.map(esc).join('<br>'):'No activity recorded')+'</p></div>';
 const html='<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f1edf4;font:14px Arial,sans-serif;color:#281f31"><main style="max-width:620px;margin:auto;background:#fff;border-radius:18px;overflow:hidden">'+
  '<header style="background:#21182d;padding:23px"><img src="https://www.soundbunker.pt/assets/ticketbunker/ticketbunker-logo.svg" alt="TicketBunker" width="195" style="max-width:90%"><p style="color:#d9cce1;font-size:11px;letter-spacing:2px;margin:17px 0 0">POST-EVENT SUMMARY</p></header>'+
  '<div style="padding:26px"><h1 style="font-size:30px;line-height:1.15;margin:0 0 9px">'+esc(report.title)+'</h1><p style="color:#695b72;line-height:1.5">Event ended '+esc(local(report.endsAt,zone))+' · '+esc(report.venue)+'</p>'+
  '<h2 style="font-size:19px;margin-top:25px">Your numbers</h2><table style="width:100%;border-collapse:collapse">'+table+'</table>'+
  section('Ticket types',tierLines)+section('Door scanner activity',staffLines)+
  '<div style="background:#eee8f3;border-left:4px solid #664575;padding:17px;border-radius:9px"><strong>'+esc(payoutText.heading)+'</strong><p style="color:#594961;line-height:1.6;font-size:13px;margin:7px 0 0">'+esc(payoutText.detail)+'</p></div>'+
  '<p style="font-size:12px;color:#706478;line-height:1.6">Revenue is based on confirmed paid tickets, not attendance. €0 test tickets never contribute to revenue.</p>'+
  '<a href="'+esc(eventUrl)+'" style="display:block;text-align:center;background:#271b33;color:white;border-radius:12px;padding:17px;text-decoration:none;font-weight:800;margin:20px 0">Open organiser dashboard →</a>'+
  '</div></main></body></html>';
 return {subject:'Your event report · '+report.title+' · TicketBunker',text,html};
}
