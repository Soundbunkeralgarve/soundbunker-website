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
  const message=d.status==='valid'?'✓ VALID ENTRY — ':d.status==='used'?'⚠ ALREADY USED — ':'✕ '+(d.message||d.status).toUpperCase()+' — ';
  show(message+(d.event||'')+(d.tier?' • '+d.tier:''),d.status);
 }catch(err){show(err.message,'error');}
 finally{setTimeout(()=>{busy=false;},1700);}
}
async function events(){
 const result=await request('/api/event-staff?mode=my');
 const list=(result.events||[]).filter(event=>event.status==='published');
 const select=$('#scanEvent');
 select.replaceChildren();
 for(const e of list){
  const option=document.createElement('option');
  option.value=e.id;option.textContent=e.title+' · '+e.venue;
  select.appendChild(option);
 }
 const params=new URLSearchParams(location.search);
 const id=params.get('eventId');
 if(id&&list.some(e=>e.id===id))select.value=id;
 $('#scannerPanel').hidden=!list.length;
 if(!list.length)status('No published events are assigned to you yet. Your organiser must finish event setup and authorise your account first.');
 else status('Access verified for '+list.length+' event(s). Allow camera access to scan.');
 if(list.length&&window.Html5Qrcode){
  try{
   scanner=new Html5Qrcode('reader');
   await scanner.start({facingMode:'environment'}, {fps:10,qrbox:{width:240,height:240}},scan,()=>{});
  }catch(err){status('Camera could not start. Check browser permission or use manual ticket entry below.');}
 }
 else if(list.length)status('Camera library unavailable; manual ticket entry still works.');
}
async function start(){
 try{
  const cfg=await fetch('/api/supabase-config').then(r=>r.json());
  if(!window.supabase)throw Error('Authentication library unavailable');
  sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});
  const {data:{session}}=await sb.auth.getSession();
  if(!session){
   const signIn=document.createElement('a');signIn.className='solid';signIn.textContent='Sign in for staff access';signIn.href='/ticket-login?role=organiser&next='+encodeURIComponent(location.pathname+location.search);
   $('#authMessage').appendChild(document.createElement('div')).appendChild(signIn);
   status('Sign in with the verified email that received your staff invitation.');
   $('#authMessage').appendChild(signIn);
   return;
  }
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
