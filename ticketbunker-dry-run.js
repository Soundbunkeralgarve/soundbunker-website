import {newRun,issue,makeCode,checkIn,quotePlan} from './ticketbunker-dry-run-model.mjs';
const $=id=>document.getElementById(id);
const STORE='ticketbunker-isolated-dry-run-v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let run=null,selectedTicketId=null;
try{const previous=JSON.parse(localStorage.getItem(STORE)||'null');
 if(previous?.version===1&&Array.isArray(previous.tickets)&&Array.isArray(previous.scans)&&previous.id&&previous.title)run=previous;
}catch{ /* private browsing may block local storage */ }
function save(){try{if(run)localStorage.setItem(STORE,JSON.stringify(run));else localStorage.removeItem(STORE);}catch{notice('Browser storage is unavailable; this simulation will reset when you leave.');}}
function notice(message){$('notice').textContent=message;}
function time(s){if(!s)return '—';const d=new Date(s);return Number.isNaN(d.getTime())?String(s):new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short'}).format(d);}
function money(cents,currency){return new Intl.NumberFormat('en-GB',{style:'currency',currency:currency||'EUR'}).format(Number(cents||0)/100);}
function createTicketCard(t,active){
 const selected=t.id===active;
 const clientLogo=/^data:image\/(png|jpeg|webp);base64,/.test(run.logoData||'')?'<img class="promoter-logo" src="'+esc(run.logoData)+'" alt="Promoter logo">':'';
 const poster=/^data:image\/(png|jpeg|webp);base64,/.test(run.posterData||'')?'<img class="ticket-art" src="'+esc(run.posterData)+'" alt="Event artwork">':'';
 return '<article class="ticket'+(t.usedAt?' is-used':'')+'" data-ticket="'+esc(t.id)+'">'+
  '<div class="ticket-top"><div><img class="tb-mini-logo" src="/assets/ticketbunker/ticketbunker-logo.svg" alt="ticketBunker"><br><small>SIMULATION TICKET · NOT VALID FOR ENTRY</small><br><strong>'+esc(run.title)+'</strong><br><small>'+esc(run.promoter)+'</small></div>'+clientLogo+'<span>DEMO ONLY</span></div>'+
  '<div class="ticket-body"><div>'+poster+'<span class="small muted">'+esc(t.tier)+' · '+money(t.priceCents,run.currency)+'</span><h3>'+esc(run.venue)+'</h3><div class="ticket-meta">'+esc(time(run.date))+'</div><div class="ticket-meta">'+(t.usedAt?'<span class="ticket-used">CHECKED IN · DEMO</span>':'UNUSED · DEMO ENTRY')+'</div></div>'+
   '<div class="ticket-qr" id="qr-'+esc(t.id)+'" aria-label="Visual preview of demo QR code"><span class="small muted">DEMO QR</span></div></div>'+
  '<div class="ticket-code">'+esc(makeCode(run.id,t.id))+'</div>'+
  '<div class="ticket-controls"><button type="button" data-action="select" data-id="'+esc(t.id)+'">'+(selected?'Selected for scanner':'Select for scan')+'</button><button type="button" data-action="copy" data-id="'+esc(t.id)+'">Copy code</button></div></article>';
}
function render(){
 const tickets=run?.tickets||[],scanned=tickets.filter(t=>t.usedAt).length;
 $('metricEvent').textContent=run?.title?.slice(0,22)||'Not created';
 $('metricIssued').textContent=String(tickets.length);
 $('metricScanned').textContent=String(scanned);
 try{const plan=run?quotePlan(run.capacity,run.country):null;
 $('metricFee').textContent=plan?(run.country==='GB'?'£':'€')+plan.price:'—';
 }catch{$('metricFee').textContent='—';}
 $('issueButton').disabled=!run;
 $('scanButton').disabled=!tickets.length;
 $('scanProgress').style.width=tickets.length?Math.round(100*scanned/tickets.length)+'%':'0%';
 if(!run){$('ticketList').innerHTML='<div class="empty">Create a demo event and issue test tickets to begin.</div>';}
 else if(!tickets.length){$('ticketList').innerHTML='<div class="empty">Event draft saved. Issue two test tickets above to preview them.</div>';}
 else{
  if(!tickets.some(t=>t.id===selectedTicketId))selectedTicketId=tickets[0].id;
  const show=tickets.slice(-12).reverse();
  $('ticketList').innerHTML=show.map(t=>createTicketCard(t,selectedTicketId)).join('')+
   (tickets.length>12?'<p class="small muted">Displaying the latest 12 of '+tickets.length+' demo tickets.</p>':'');
  if(typeof window.QRCode==='function'){
   for(const t of show){const target=$('qr-'+t.id);if(target)try{target.replaceChildren();new window.QRCode(target,{text:makeCode(run.id,t.id),width:88,height:88,correctLevel:window.QRCode.CorrectLevel.L});}catch{target.textContent='QR unavailable';}}
  }
 }
 $('auditLog').innerHTML=run?.scans?.length?run.scans.slice().reverse().slice(0,30).map(s=>'<div class="logrow"><div><strong>'+esc(s.by)+'</strong><br><span>'+esc(s.ticketId.slice(0,13))+'…</span></div><span>'+esc(time(s.at))+'</span></div>').join(''):'<div class="empty">No successful scans recorded yet.</div>';
}
function fillForm(){
 if(!run)return;
 const f=$('demoEventForm');
 f.elements.title.value=run.title;f.elements.promoter.value=run.promoter;f.elements.venue.value=run.venue;f.elements.date.value=run.date;f.elements.country.value=run.country;
 if(Array.from(f.elements.category.options).some(o=>o.value===run.category))f.elements.category.value=run.category;
 $('issueForm').elements.capacity.value=String(run.capacity);
 notice('Saved dry-run event restored from this browser. No real data or payment was created.');
}
const future=new Date(Date.now()+30*86400000);const offset=future.getTimezoneOffset()*60000;
$('demoDate').value=new Date(future.getTime()-offset).toISOString().slice(0,16);
fillForm();
async function onDeviceImage(file,maxWidth){
 if(!file)return null;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>3000000)
  throw Error('Upload a PNG, JPEG or WebP under 3 MB.');
 const objectUrl=URL.createObjectURL(file);
 try{
  const picture=new Image();
  await new Promise((resolve,reject)=>{picture.onload=resolve;picture.onerror=()=>reject(Error('Image cannot be opened'));picture.src=objectUrl;});
  const ratio=Math.min(1,maxWidth/Math.max(picture.width,picture.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(picture.width*ratio));canvas.height=Math.max(1,Math.round(picture.height*ratio));
  canvas.getContext('2d').drawImage(picture,0,0,canvas.width,canvas.height);
  const data=canvas.toDataURL(file.type==='image/png'?'image/png':'image/jpeg',.72);
  if(data.length>1800000)throw Error('Image is too large after resizing. Choose a smaller file.');
  return data;
 }finally{URL.revokeObjectURL(objectUrl);}
}
$('demoEventForm').addEventListener('submit',async e=>{
 e.preventDefault();
 try{
  const form=e.currentTarget;
  const data=Object.fromEntries(new FormData(form));
  // Starting a new sample event deliberately clears old simulation tickets.
  if(run?.tickets?.length&&!confirm('Create a new demo event and clear the current mock tickets?'))return;
  const logoData=await onDeviceImage(form.elements.logo.files?.[0],350);
  const posterData=await onDeviceImage(e.currentTarget.elements.poster.files?.[0],1000);
  run={...newRun(data),logoData,posterData};selectedTicketId=null;save();render();
  $('scanResult').className='scan-result';$('scanResult').textContent='Sample event created. Issue some demo tickets.';
  notice('Demo event saved. Continue to Step 02 to issue mock tickets.');
 }catch(err){notice(err.message);}
});
$('issueForm').addEventListener('submit',e=>{
 e.preventDefault();
 try{
  const d=Object.fromEntries(new FormData(e.currentTarget));
  run=issue(run,d);selectedTicketId=run.tickets.at(-1).id;save();render();
  $('scanCode').value=makeCode(run.id,selectedTicketId);
  $('scanResult').className='scan-result';$('scanResult').textContent='Demo tickets created — ready to simulate entry.';
  notice(d.quantity+' demo ticket(s) issued. No customer charged and no ticket email sent.');
 }catch(err){notice(err.message);}
});
$('ticketList').addEventListener('click',async e=>{
 const button=e.target.closest('[data-action][data-id]');if(!button||!run)return;
 const ticket=run.tickets.find(t=>t.id===button.dataset.id);if(!ticket)return;
 const code=makeCode(run.id,ticket.id);
 if(button.dataset.action==='select'){
  selectedTicketId=ticket.id;$('scanCode').value=code;
  render();notice('Ticket selected. Use Step 04 to scan it as a door staff member.');
  $('scanner').scrollIntoView({behavior:'smooth',block:'start'});
 }else if(button.dataset.action==='copy'){
  try{await navigator.clipboard.writeText(code);notice('Demo code copied. Paste it in the scanner.');}
  catch{$('scanCode').value=code;$('scanCode').focus();$('scanCode').select();notice('Demo code selected in scanner field.');}
 }
});
$('scanForm').addEventListener('submit',e=>{
 e.preventDefault();
 const result=checkIn(run,$('scanCode').value,$('doorStaff').value);
 const output=$('scanResult');output.className='scan-result '+result.status;
 const labels={valid:'✓ VALID · Demo entry accepted',used:'! ALREADY USED · Duplicate blocked',wrong_event:'✕ WRONG EVENT · Rejected',invalid:'✕ INVALID CODE · Rejected'};
 output.textContent=(labels[result.status]||'✕ REJECTED')+' — '+result.message;
 if(result.status==='valid'){run=result.run;save();render();}
 notice('Scan result: '+result.status.toUpperCase()+'. This was a simulation; the real scanner and ticket database were not touched.');
});
$('reset').addEventListener('click',()=>{if(!confirm('Erase the demo event and its test tickets from this browser?'))return;
 run=null;selectedTicketId=null;save();render();$('scanCode').value='';$('scanResult').className='scan-result';
 $('scanResult').textContent='Issue a demo ticket to start.';notice('Dry run reset. No real events or customer information were affected.');
});
$('selfCheck').addEventListener('click',()=>{
 const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',a='11111111-1111-4111-8111-111111111111';
 const b='22222222-2222-4222-8222-222222222222';
 const sample=newRun({title:'Sample QA Event',promoter:'Demo',venue:'Test Venue',date:'2026-12-18T20:00',country:'PT'},id);
 const minted=issue(sample,{quantity:1,capacity:1,price:0,tier:'QA'},()=>a);
 const valid=checkIn(minted,makeCode(id,a),'Door A');
 const results=[
  ['First scan accepted',valid.status==='valid'&&valid.run.scans.length===1],
  ['Duplicate rejected',checkIn(valid.run,makeCode(id,a),'Door B').status==='used'],
  ['Wrong event rejected',checkIn(minted,makeCode(b,a)).status==='wrong_event'],
  ['Made-up ticket rejected',checkIn(minted,makeCode(id,b)).status==='invalid'],
  ['Capacity enforced',(()=>{try{issue(minted,{quantity:1,capacity:1,price:0,tier:'QA'});return false;}catch{return true;}})()]
 ];
 $('selfResult').textContent=results.map(([label,ok])=>(ok?'✓ PASS — ':'✕ FAIL — ')+label).join('\n');
 notice(results.every(x=>x[1])?'All five isolated dry-run checks passed.':'A dry-run check failed; do not approve release.');
});
$('exportReport').addEventListener('click',()=>{
 if(!run){notice('Create a dry-run event before exporting a report.');return;}
 const output={mode:'SIMULATION ONLY — NOT REAL ADMISSION',generatedAt:new Date().toISOString(),
  event:{id:run.id,title:run.title,venue:run.venue,promoter:run.promoter,country:run.country,capacity:run.capacity},
  issued:run.tickets.length,scanned:run.scans.length,scans:run.scans};
 const blob=new Blob([JSON.stringify(output,null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download='ticketbunker-dry-run-report.json';link.click();URL.revokeObjectURL(url);
 notice('Downloaded local dry-run audit report. No server data accessed.');
});
render();