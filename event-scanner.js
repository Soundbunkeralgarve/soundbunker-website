let sb,access,scanner,busy=false;
const $=s=>document.querySelector(s);
function status(message){$('#authMessage').textContent=message;}
function show(message,kind){
 const e=$('#result');e.textContent=message;
 e.style.background=kind==='valid'?'#12533f':kind==='used'?'#603d16':'#6a233b';
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
async function scan(code){
 if(busy||!$('#scanEvent').value)return;
 busy=true;
 try{
  const d=await request('/api/event-scan',{code,eventId:$('#scanEvent').value});
  const message=d.status==='valid'?(d.test?'✓ TEST QR VALID — ':'✓ ENTRY APPROVED — '):d.status==='used'?'⚠ ALREADY USED — ':'✕ '+(d.message||d.status).toUpperCase()+' — ';
  show(message+(d.event||'')+(d.tier?' · '+d.tier:'')+(d.status==='valid'?' · CHECK AGE/PHOTO ID IF REQUIRED':''),d.status);
 }catch(err){show(err.message,'error');}
 finally{setTimeout(()=>{busy=false;},1700);}
}
async function events(){
 const params=new URLSearchParams(location.search),requested=params.get('eventId')||'';
 const qs=new URLSearchParams({mode:'my'});if(requested)qs.set('eventId',requested);
 const result=await request('/api/event-staff?'+qs);
 const list=result.events||[];
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
 e.preventDefault();const code=$('#code').value.trim();if(code)scan(code);
});
window.addEventListener('pagehide',()=>scanner?.stop().catch(()=>{}));
window.addEventListener('load',start);
