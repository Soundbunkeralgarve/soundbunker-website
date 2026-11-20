// Pay at door and the live door count for the browser scanner, matching the Scanner app.
// Shares `request`, `show`, `scanner` and `$` with event-scanner.js.
(()=>{
let tab='scan',summary=null,doorTimer,saleTimer,sale=null,tierId='',qty=1,doorBusy=false;
const money=(cents,currency='eur')=>(String(currency).toLowerCase()==='gbp'?'£':'€')+((Number(cents)||0)/100).toFixed(2);
const eventId=()=>$('#scanEvent').value;
const uuid=()=>crypto.randomUUID();
const sellable=s=>(s?.tiers||[]).filter(t=>t.remaining>0&&(s.rehearsal||t.priceCents>0));

function setTab(next){
 tab=next;
 document.querySelectorAll('[data-door-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.doorTab===tab)));
 $('#scanView').hidden=tab!=='scan';$('#sellView').hidden=tab!=='sell';$('#countView').hidden=tab!=='count';
 // The camera only runs on the Scan tab.
 try{if(tab==='scan')scanner?.resume?.();else scanner?.pause?.(true);}catch{}
 refresh();schedule();
}
function schedule(){clearInterval(doorTimer);doorTimer=setInterval(()=>{if(!document.hidden)refresh();},tab==='count'?3000:8000);}
async function refresh(){
 if(!eventId()||!access)return;
 try{summary=await request('/api/event-door?eventId='+encodeURIComponent(eventId()));$('#doorError').hidden=true;render();}
 catch(err){$('#doorError').textContent=err.message;$('#doorError').hidden=false;}
}
function render(){
 const s=summary;if(!s)return;
 $('#doorInside').textContent=s.inside;
 $('#doorCapacity').textContent=s.capacity?'of '+s.capacity+' capacity':'inside now';
 $('#doorBar').style.width=s.capacity?Math.min(100,Math.round(s.inside/s.capacity*100))+'%':'0%';
 $('#doorStats').innerHTML=[['Scanned in',s.admitted],['Clicker',s.manual],['Sold at door',(s.doorCard?.tickets||0)+(s.doorCash?.tickets||0)],['Card',money(s.doorCard?.cents,s.currency)],['Cash',money(s.doorCash?.cents,s.currency)]].map(([k,v])=>'<div><strong>'+v+'</strong><span>'+k+'</span></div>').join('');
 $('#countMinus').disabled=doorBusy||!s.open||s.manual<=0;$('#countPlus').disabled=doorBusy||!s.open;
 $('#doorLiveCount').textContent=s.inside+' inside';
 const tiers=sellable(s);
 if(!tiers.some(t=>t.id===tierId))tierId=tiers[0]?.id||'';
 $('#doorTiers').innerHTML=tiers.length?tiers.map(t=>'<label class="door-tier"><input type="radio" name="doorTier" value="'+t.id+'"'+(t.id===tierId?' checked':'')+'><span><strong></strong><small>'+money(t.priceCents,s.currency)+' · '+t.remaining+' left</small></span></label>').join(''):'<p class="door-note">'+(s.open?'No tickets left to sell at the door.':'Door sales open 18 hours before the event starts.')+'</p>';
 // Tier names are organiser text, so they are set as text rather than HTML.
 $('#doorTiers').querySelectorAll('.door-tier strong').forEach((el,i)=>el.textContent=tiers[i].name);
 const tier=tiers.find(t=>t.id===tierId);qty=Math.min(qty,Math.max(1,Math.min(8,tier?.remaining||1)));
 $('#doorQty').textContent=qty;$('#doorTotal').textContent=money((tier?.priceCents||0)*qty,s.currency);
 const off=!s.open||!tier||doorBusy;
 $('#sellCard').disabled=off||!!s.rehearsal;$('#sellCash').disabled=off;
 $('#doorRehearsal').hidden=!s.rehearsal;
}
$('#doorTiers').addEventListener('change',e=>{if(e.target.name==='doorTier'){tierId=e.target.value;qty=1;render();}});
$('#qtyMinus').onclick=()=>{qty=Math.max(1,qty-1);render();};
$('#qtyPlus').onclick=()=>{qty=Math.min(8,qty+1);render();};
async function adjust(delta){
 doorBusy=true;render();
 try{summary=await request('/api/event-door',{action:'count',eventId:eventId(),delta});}catch(err){show(err.message,'error','COUNT NOT SAVED');}
 finally{doorBusy=false;render();}
}
$('#countPlus').onclick=()=>adjust(1);$('#countMinus').onclick=()=>adjust(-1);
$('#sellCash').onclick=async()=>{
 const tier=sellable(summary).find(t=>t.id===tierId);if(!tier)return;
 if(!confirm('Take '+money(tier.priceCents*qty,summary.currency)+' cash for '+qty+' × '+tier.name+'?'))return;
 doorBusy=true;render();const body={action:'cash',eventId:eventId(),tier:tierId,quantity:qty,requestId:uuid()};
 try{
  // Retrying with the same request id can never record the sale twice.
  let r;try{r=await request('/api/event-door',body);}catch(err){if(!/fetch|network/i.test(err.message))throw err;r=await request('/api/event-door',body);}
  show(money(r.totalCents,r.currency)+' cash recorded. '+(qty>1?'All '+qty+' tickets are checked in.':'Ticket checked in.'),'valid','CASH · ADMIT '+qty);qty=1;
 }catch(err){show(err.message,'error','SALE NOT RECORDED');}
 finally{doorBusy=false;refresh();}
};
$('#sellCard').onclick=async()=>{
 doorBusy=true;render();
 try{
  const r=await request('/api/event-door',{action:'card',eventId:eventId(),tier:tierId,quantity:qty,requestId:uuid()});
  if(!/^https:\/\/checkout\.stripe\.com\//.test(r.url))throw Error('Invalid payment link');
  sale={orderId:r.orderId,quantity:qty};
  $('#payQr').replaceChildren();new QRCode($('#payQr'),{text:r.url,width:260,height:260,correctLevel:QRCode.CorrectLevel.L});
  $('#payAmount').textContent=money(r.totalCents,r.currency);$('#payStatus').textContent='Waiting for payment…';
  $('#payDialog').hidden=false;clearInterval(saleTimer);saleTimer=setInterval(checkSale,2500);
 }catch(err){show(err.message,'error','CARD SALE NOT STARTED');}
 finally{doorBusy=false;render();}
};
async function checkSale(){
 if(!sale)return;
 try{
  const r=await request('/api/event-door?eventId='+encodeURIComponent(eventId())+'&order='+encodeURIComponent(sale.orderId));
  if(r.status==='reserved')return;
  closeSale();
  if(r.status==='paid')show(money(r.totalCents,r.currency)+' card payment received. '+(r.quantity>1?'All '+r.quantity+' tickets are checked in.':'Ticket checked in.'),'valid','PAID · ADMIT '+r.quantity);
  else if(r.status==='needs_attention')show('Paid, but this ticket type filled up at the same moment. Ask the organiser before admitting.','used','CHECK PAYMENT');
  else show('The card payment was cancelled or timed out. Nothing was charged. Start a new sale.','error','NOT PAID');
  qty=1;refresh();
 }catch{$('#payStatus').textContent='Connection lost. Still checking…';}
}
function closeSale(){clearInterval(saleTimer);sale=null;$('#payDialog').hidden=true;}
$('#payCancel').onclick=async()=>{
 if(!sale)return;const current=sale;$('#payCancel').disabled=true;
 try{
  const r=await request('/api/event-door',{action:'cancel',eventId:eventId(),order:current.orderId});
  if(r.status==='paid'){sale=current;await checkSale();return;}
  closeSale();show('Sale cancelled. Nothing was charged.','neutral');
 }catch(err){$('#payStatus').textContent=err.message;}
 finally{$('#payCancel').disabled=false;}
};
document.querySelectorAll('[data-door-tab]').forEach(b=>b.onclick=()=>setTab(b.dataset.doorTab));
$('#scanEvent').addEventListener('change',()=>{summary=null;tierId='';qty=1;refresh();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
// Start once the scanner panel has an event.
new MutationObserver(()=>{if(!$('#scannerPanel').hidden&&!doorTimer){refresh();schedule();}}).observe($('#scannerPanel'),{attributes:true,attributeFilter:['hidden']});
})();
