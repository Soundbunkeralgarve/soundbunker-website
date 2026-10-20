import {$,api,escapeHtml as esc,date,money} from './shared.js';
import {payoutView} from './payout-summary.js';

let latest=null,requestNumber=0;
async function load(){
 const seq=++requestNumber,id=$('#report-event').value;
 latest=null;$('#downloadReport').disabled=true;
 $('#settlementBody').replaceChildren();$('#refundRequests').replaceChildren();$('#payoutChoice').replaceChildren();
 if(!id){$('#settlementStatus').textContent='Select an event to see its reporting schedule.';return;}
 $('#settlementStatus').textContent='Checking report and payout…';
 try{
  const {data:{session}}=await window.ticketbunkerAuth.auth.getSession();
  const d=await api('settlement?eventId='+encodeURIComponent(id),null,session?.access_token);
  if(seq!==requestNumber)return;latest=d;
  const r=d.report,s=d.settlement,v=payoutView(d),zone=d.event.venue_timezone,c=d.event.currency;
  $('#settlementStatus').textContent=r?'Report generated '+date(r.generated_at,zone)+' · event local time.':!d.dueAt?'Set a finish time for this event to schedule its automatic report.':d.event.status!=='published'?'Draft event · report scheduled after publication for '+date(d.dueAt,zone)+'.':Date.parse(d.dueAt)>Date.now()?'Your report is due '+date(d.dueAt,zone)+' · automatically after your event finishes.':'Your post-show report is being prepared. Refresh shortly.';
  $('#settlementBody').innerHTML=`<div class="settlement-metrics"><article><span>NET PAYOUT</span><strong>${esc(v.amount)}</strong><small>${esc(v.status)}</small></article><article><span>PAYOUT METHOD</span><strong>${esc(v.method)}</strong><small>${v.fast?(s.fast_fee_cents!=null?'Fast payout fee: '+esc(money(s.fast_fee_cents,c)):'1% of the instant payout, deducted on release'):'No TicketBunker speed surcharge'}</small></article><article><span>EXPECTED BANK ARRIVAL</span><strong>${esc(v.arrival)}</strong><small>${v.fast?'Usually within 30 minutes of Stripe accepting an eligible instant payout; delays can occur.':'Normally 2–3 working days from release. Your confirmed bank date appears above.'}</small></article></div>${r?`<dl class="settlement-lines"><div><dt>Paid tickets sold</dt><dd>${r.sold_tickets}</dd></div><div><dt>Gross paid ticket revenue</dt><dd>${esc(money(r.gross_cents,c))}</dd></div><div><dt>Processing fees</dt><dd>${s?.processing_fee_cents!=null?esc(money(s.processing_fee_cents,c)):'Pending reconciliation'}</dd></div><div><dt>Refund deductions</dt><dd>${s?.refunds_cents!=null?esc(money(s.refunds_cents,c)):'Pending reconciliation'}</dd></div><div><dt>TicketBunker sales fee / other adjustments</dt><dd>${s?.adjustments_cents!=null?esc(money(s.adjustments_cents,c)):'Pending reconciliation'}</dd></div><div><dt>Paid check-ins / unscanned tickets</dt><dd>${r.checked_in} / ${r.not_scanned}</dd></div></dl><p class="tb-field-help">Sales and attendance are a fixed snapshot at report generation. Payout status and deductions update separately after reconciliation. An unscanned paid ticket is still a sale.</p>`:''}`;
  if(s?.payout_message)$('#settlementBody').insertAdjacentHTML('beforeend','<p role="status">'+esc(s.payout_message)+'</p>');
  await renderPayoutChoice(d,session?.access_token,seq);
  if(seq!==requestNumber)return;
  $('#refundRequests').innerHTML=d.refundRequests?.length?'<h4>Refund requests to review</h4>'+d.refundRequests.map(x=>`<article class="refund-request"><strong>${esc(x.status.replaceAll('_',' '))}</strong><p>${esc(x.reason)}</p><small>Request ${esc(x.id)} · ${esc(date(x.created_at,zone))}</small><p>Payment refunds require review and Stripe confirmation. Recording a request does not issue money.</p></article>`).join(''):'';
  $('#downloadReport').disabled=!r;
 }catch(e){if(seq!==requestNumber)return;latest=null;$('#settlementStatus').textContent=e.message;$('#settlementBody').replaceChildren();$('#refundRequests').replaceChildren();$('#payoutChoice').replaceChildren();$('#downloadReport').disabled=true;}
}
$('#downloadReport').onclick=()=>{
 if(!latest?.report)return;const d=latest,r=d.report,v=payoutView(d),c=d.event.currency;
 const rows=[['TicketBunker post-show report',''],['Event',r.event_title],['Report generated',r.generated_at],['Event finish',r.ends_at],['Report due',r.due_at],['Currency',c.toUpperCase()],['Paid tickets sold',r.sold_tickets],['Gross paid ticket revenue',money(r.gross_cents,c)],['Paid check-ins',r.checked_in],['Unscanned paid tickets',r.not_scanned],['Net payout',v.amount],['Payout method',v.method],['Payout status',v.status],['Expected bank arrival',v.arrival],['Processing fees',d.settlement?.processing_fee_cents==null?'Pending reconciliation':money(d.settlement.processing_fee_cents,c)],['Refund deductions',d.settlement?.refunds_cents==null?'Pending reconciliation':money(d.settlement.refunds_cents,c)],['Sales fees and fast payout deductions',d.settlement?.adjustments_cents==null?'Pending reconciliation':money(d.settlement.adjustments_cents,c)],[],['Ticket type','Sold','Gross revenue'],...(r.tier_summary||[]).map(t=>[t.name,t.sold,money(t.gross_cents,c)]),[],['Door scanner','Check-ins'],...(r.scanner_summary||[]).map(t=>[t.name,t.scans]),[],['Powered by','SoundBunker Algarve']];
 const cell=value=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
 const csv='\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='ticketbunker-report-'+d.event.id+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
window.addEventListener('ticketbunker:ready',load);
$('#report-event').addEventListener('change',load);$('#refresh-report').addEventListener('click',load);

window.addEventListener('ticketbunker:reports',load);

async function renderPayoutChoice(d,token,seq){
 const target=$('#payoutChoice');target.replaceChildren();
 if(!d.event.ends_at||Date.parse(d.event.ends_at)<=Date.now())return;
 try{
  const o=await api('ticketbunker-finance?eventId='+encodeURIComponent(d.event.id)+'&action=payoutOptions',null,token);
  if(seq!==requestNumber)return;
  if(!o.canChoose){target.textContent=o.message||'';return;}
  const current=d.settlement?.payout_option||'standard';
  target.innerHTML='<h3>Choose your payout</h3><p>Your report and payout run automatically after the event. Save your choice before the recorded finish time.</p><form id="payout-choice-form"><label>Payout speed<select name="option"><option value="standard">Standard · no speed fee · normally 2–3 working days</option><option value="fast"'+(!o.fastEligible?' disabled':'')+'>Fast Payout · eligible instant payment · 1% fee</option></select></label><p>'+(o.fastEligible?'Fast Payout: 1% of the instant payout is deducted from proceeds, with no TicketBunker markup. For example, €1,010 of net proceeds gives a €1,000 payout and a €10 fee. Eligible payments usually arrive within 30 minutes.':'Fast Payout needs an eligible bank destination. Standard payout is available automatically.')+'</p><label class="check"><input name="confirmed" type="checkbox" required><span>I confirm this payout choice and, if selecting Fast Payout, agree to deduct its disclosed fee from event proceeds.</span></label><button class="secondary" type="submit">Save payout choice</button><p id="payout-choice-status" role="status"></p></form>';
  target.querySelector('select').value=current;
  target.querySelector('form').onsubmit=async e=>{
   e.preventDefault();if(seq!==requestNumber||$('#report-event').value!==d.event.id)return;
   const form=e.currentTarget,b=e.submitter||form.querySelector('button'),status=form.querySelector('#payout-choice-status'),option=form.querySelector('select').value;
   if(b.disabled||!form.reportValidity())return;b.disabled=true;status.textContent='Saving payout choice…';
   try{
    const {data:{session}}=await window.ticketbunkerAuth.auth.getSession();
    if(!session)throw Error('Your session expired. Please sign in again.');
    if(seq!==requestNumber)return;
    const result=await api('ticketbunker-finance',{action:'payoutOptions',eventId:d.event.id,option,confirmed:true},session.access_token);
    if(seq===requestNumber)status.textContent=result.message;
   }catch(error){if(seq===requestNumber)status.textContent=error.message;}finally{b.disabled=false;}
  };
 }catch(error){if(seq===requestNumber)target.textContent='Payout settings: '+error.message;}
}
