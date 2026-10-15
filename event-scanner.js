let sb,access,scanner,busy=false,feedbackTimer,lastCameraCode='',lastCameraSeen=0;
const $=s=>document.querySelector(s);
function status(message){$('#authMessage').textContent=message;}
function dismissFeedback(){
 clearTimeout(feedbackTimer);$('#scanFeedback').hidden=true;
}
function show(message,kind,heading){
 const summary=$('#result');summary.textContent=message;summary.dataset.kind=kind;
 if(kind==='neutral'){dismissFeedback();return;}
 clearTimeout(feedbackTimer);
 const pending=kind==='pending',feedback=$('#scanFeedback');
 feedback.dataset.kind=kind;feedback.hidden=false;
 $('#feedbackIcon').textContent=pending?'…':kind==='valid'?'✓':kind==='used'?'!':'✕';
 $('#feedbackHeading').textContent=heading|| (pending?'CHECKING…':kind==='valid'?'ENTRY APPROVED':kind==='used'?'ALREADY USED':'NO ADMISSION');
 $('#feedbackDetail').textContent=message;
 $('#feedbackNext').hidden=pending;
 if(!pending){
  try{navigator.vibrate?.(kind==='valid'?100:[140,80,140]);}catch{}
  feedbackTimer=setTimeout(dismissFeedback,kind==='valid'?1400:2600);
 }
}
async function request(path,body){
 const r=await fetch(path,{
  method:body?'POST':'GET',
  headers:{authorization:'Bearer '+access,...(body?{'content-type':'application/json'}:{})},
  body:body?JSON.stringify(body):undefined,cache:'no-store'
 });
 const d=await r.json();
 if(!r.ok)throw Error(d.error||'Request failed');
 return d;
}
async function scan(code,source='camera'){
 const now=Date.now();
 // Holding one QR in frame must not immediately turn a successful scan into a duplicate warning.
 if(source==='camera'&&code===lastCameraCode&&now-lastCameraSeen<1800){lastCameraSeen=now;return;}
 if(busy||!$('#scanEvent').value)return;
 if(source==='camera'){lastCameraCode=code;lastCameraSeen=now;}
 busy=true;
 const selectedEvent=$('#scanEvent').value;
 show('Please wait for the ticket check.','pending','CHECKING…');
 try{
  const d=await request('/api/event-scan',{code,eventId:selectedEvent});
  const heading=d.status==='valid'?(d.test?'TEST QR VALID':'ENTRY APPROVED'):d.status==='used'?'ALREADY USED':d.status==='wrong_event'?'WRONG EVENT':'NO ADMISSION';
  const detail=[d.event,d.tier,d.status==='valid'?(d.test?'Private test only — no public admission.':'One ticket checked in. Check age / photo ID if required.'):(d.message||'Do not admit this ticket.')].filter(Boolean).join(' · ');
  show(detail,d.status,heading);
 }catch(err){show(err.message||'Connection lost. Do not admit without confirmation.','error','NOT VERIFIED');}
 finally{setTimeout(()=>{busy=false;},700);}
}
function showOrganiserLogo(event){
 const img=$('#scannerOrganiserLogo');
 if(!img)return;
 const url=event?.event_logo_url||'';
 img.hidden=!/^https:\/\//i.test(url);
 if(!img.hidden)img.src=url;
}
async function events(){
 const params=new URLSearchParams(location.search),requested=params.get('eventId')||'';
 const qs=new URLSearchParams({mode:'my'});if(requested)qs.set('eventId',requested);
 const result=await request('/api/event-staff?'+qs);
 const list=result.events||[];
 window.__ticketbunkerScannerEvents=list;
 const select=$('#scanEvent');select.replaceChildren();
 for(const event of list){
  const option=document.createElement('option');option.value=event.id;
  option.textContent=event.title+' · '+event.venue;select.appendChild(option);
 }
 const assigned=!!requested&&list.some(event=>event.id===requested);
 if(assigned)select.value=requested;
 $('#scannerPanel').hidden=!list.length;
 $('#scanEvent').hidden=list.length===1;
 $('#scanEventLabel').hidden=list.length===1;
 $('#assignedEventName').textContent=list.find(e=>e.id===select.value)?.title||'Your event';
  showOrganiserLogo(list.find(e=>e.id===select.value));
 if(!list.length){
  status('No active assigned event. Ask the organiser to invite you or reopen your private event scanner link.');
  return;
 }
 status(list.length===1?'Ready: this scanner is assigned to '+list[0].title+'.':
  'Choose one of your '+list.length+' authorised, currently open events.');
 if(scanner)return;
 if(window.Html5Qrcode){
  try{
   scanner=new Html5Qrcode('reader');
   await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:240,height:240}},scan,()=>{});
  }catch(error){status('Camera unavailable. Allow camera access in browser settings or use manual ticket entry.');}
 }else status('Camera library unavailable. You can use manual ticket entry.');
}
$('#scanEvent').addEventListener('change',()=>{
 const option=$('#scanEvent').selectedOptions[0];
 $('#assignedEventName').textContent=option?.textContent||'Your event';
 const all=window.__ticketbunkerScannerEvents||[];
 showOrganiserLogo(all.find(e=>e.id===$('#scanEvent').value));
 lastCameraCode='';lastCameraSeen=0;
 show('Ready to scan '+(option?.textContent||'the selected event')+'.','neutral');
});
async function start(){
 try{
  const cfg=await fetch('/api/supabase-config').then(r=>r.json());
  if(!window.supabase)throw Error('Authentication library unavailable');
  sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});
  const {data:{session}}=await sb.auth.getSession();
  if(!session){
   $('#scannerSignIn').hidden=false;
   const next=location.pathname+location.search;
   $('#scannerSignInLink').href='/client?next='+encodeURIComponent(next);
   status('Sign in with the invited email address to activate your scanner.');
   return;
  }
  $('#scannerSignIn').hidden=true;
  access=session.access_token;
  const invite=new URLSearchParams(location.search).get('invite');
  if(invite){
   $('#invitePanel').hidden=false;
   $('#acceptInvite').onclick=async()=>{
    $('#acceptInvite').disabled=true;
    try{
     const res=await request('/api/event-staff',{action:'accept',token:invite});
     const url=new URL(location.href);url.searchParams.delete('invite');url.searchParams.set('eventId',res.eventId);
     history.replaceState(null,'',url.pathname+url.search);
     $('#invitePanel').hidden=true;
     await events();
    }catch(error){status(error.message);$('#acceptInvite').disabled=false;}
   };
   status('Secure invitation found. Tap Accept to join this event’s scanning team.');
  }else await events();
 }catch(err){status(err.message);}
}
$('#manual').addEventListener('submit',e=>{
 e.preventDefault();const code=$('#code').value.trim();if(code)scan(code,'manual');
});
$('#feedbackNext').addEventListener('click',dismissFeedback);
window.addEventListener('pagehide',()=>{clearTimeout(feedbackTimer);scanner?.stop().catch(()=>{});});
window.addEventListener('load',start);
