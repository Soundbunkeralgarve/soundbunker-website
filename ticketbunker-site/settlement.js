import {$,api,escapeHtml as esc,date,money} from './shared.js';
import {payoutView} from './payout-summary.js';

let latest=null,requestNumber=0;
async function load(){
 const id=$('#reportEvent').value;if(!id)return;
 const seq=++requestNumber;$('#settlementStatus').textContent='Checking report and payout…';$('#downloadReport').disabled=true;
 try{
  const {data:{session}}=await window.ticketbunkerAuth.auth.getSession();
  const d=await api('settlement?eventId='+encodeURIComponent(id),null,session?.access_token);
  if(seq!==requestNumber)return;latest=d;
  const r=d.report,s=d.settlement,v=payoutView(d),zone=d.event.venue_timezone,c=d.event.currency;
  $('#settlementStatus').textContent=r?'Report generated '+date(r.generated_at,zone)+' · event local time.':!d.dueAt?'Set a finish time for this event to schedule its automatic report.':d.event.status!=='published'?'Draft event · report scheduled after publication for '+date(d.dueAt,zone)+'.':Date.parse(d.dueAt)>Date.now()?'Your report is due '+date(d.dueAt,zone)+' · 12 hours after the show ends.':'Your post-show report is being prepared. Refresh shortly.';
  $('#settlementBody').innerHTML=`<div class="settlement-metrics"><article><span>NET PAYOUT</span><strong>${esc(v.amount)}</strong><small>${esc(v.status)}</small></article><article><span>PAYOUT METHOD</span><strong>${esc(v.method)}</strong><small>${v.fast?'Verified fast payout fee: '+esc(money(s.fast_fee_cents,c)):'No TicketBunker speed surcharge'}</small></article><article><span>EXPECTED BANK ARRIVAL</span><strong>${esc(v.arrival)}</strong><small>${v.fast?'Usually within 30 minutes of Stripe accepting an eligible instant payout; delays can occur.':'Bank arrival follows Stripe confirmation, after the post-show checks.'}</small></article></div>${r?`<dl class="settlement-lines"><div><dt>Paid tickets sold</dt><dd>${r.sold_tickets}</dd></div><div><dt>Gross paid ticket revenue</dt><dd>${esc(money(r.gross_cents,c))}</dd></div><div><dt>Processing fees</dt><dd>${s?.processing_fee_cents!=null?esc(money(s.processing_fee_cents,c)):'Pending reconciliation'}</dd></div><div><dt>Refund deductions</dt><dd>${s?.refunds_cents!=null?esc(money(s.refunds_cents,c)):'Pending reconciliation'}</dd></div><div><dt>Other adjustments</dt><dd>${s?.adjustments_cents!=null?esc(money(s.adjustments_cents,c)):'Pending reconciliation'}</dd></div><div><dt>Paid check-ins / unscanned tickets</dt><dd>${r.checked_in} / ${r.not_scanned}</dd></div></dl><p class="tb-field-help">Sales and attendance are a fixed snapshot at report generation. Payout status and deductions update separately after reconciliation. An unscanned paid ticket is still a sale.</p>`:''}`;
  $('#refundRequests').innerHTML=d.refundRequests?.length?'<h4>Refund requests to review</h4>'+d.refundRequests.map(x=>`<article class="refund-request"><strong>${esc(x.status.replaceAll('_',' '))}</strong><p>${esc(x.reason)}</p><small>Request ${esc(x.id)} · ${esc(date(x.created_at,zone))}</small><p>Payment refunds require review and Stripe confirmation. Recording a request does not issue money.</p></article>`).join(''):'';
  $('#downloadReport').disabled=!r;
 }catch(e){if(seq!==requestNumber)return;$('#settlementStatus').textContent=e.message;$('#settlementBody').replaceChildren();}
}
$('#downloadReport').onclick=()=>{
 if(!latest?.report)return;const d=latest,r=d.report,v=payoutView(d),c=d.event.currency;
 const rows=[['TicketBunker post-show report',''],['Event',r.event_title],['Report generated',r.generated_at],['Event finish',r.ends_at],['Report due',r.due_at],['Currency',c.toUpperCase()],['Paid tickets sold',r.sold_tickets],['Gross paid ticket revenue',money(r.gross_cents,c)],['Paid check-ins',r.checked_in],['Unscanned paid tickets',r.not_scanned],['Net payout',v.amount],['Payout method',v.method],['Payout status',v.status],['Expected bank arrival',v.arrival],['Powered by','SoundBunker Algarve']];
 const cell=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const csv='\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ticketbunker-report-'+d.event.id+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('ticketbunker:ready',load);
$('#reportEvent').addEventListener('change',load);$('#refreshReport').addEventListener('click',load);
