let sb,access;const $=s=>document.querySelector(s);let busy=false,scanner;
function show(message,kind){const e=$('#result');e.textContent=message;e.style.background=kind==='valid'?'#12533f':kind==='used'?'#603d16':'#6a233b';}
async function scan(code){
 if(busy)return;busy=true;
 try{
   const r=await fetch('/api/event-scan',{method:'POST',headers:{authorization:'Bearer '+access,'content-type':'application/json'},body:JSON.stringify({code})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'Scanner error');
   show((d.status==='valid'?'✓ VALID ENTRY — ':d.status==='used'?'⚠ ALREADY USED — ':'✕ '+(d.message||d.status).toUpperCase()+' — ')+(d.event||'')+(d.tier?' • '+d.tier:''),d.status);
 }catch(err){show(err.message,'error');}
 finally{setTimeout(()=>{busy=false;},1800);}
}
async function start(){
 try{
   const cfg=await fetch('/api/supabase-config').then(x=>x.json());
   if(!window.supabase)throw Error('Authentication library unavailable');
   sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});
   const {data:{session}}=await sb.auth.getSession();
   if(!session){$('#authMessage').textContent='Please sign in through Client Login using your admin account first.';return;}
   access=session.access_token;
   const check=await fetch('/api/event-admin',{headers:{authorization:'Bearer '+access}});
   if(!check.ok)throw Error('Admin access required for door scanning');
   $('#authMessage').textContent='Signed in. Allow camera access to scan tickets.';
   $('#scannerPanel').hidden=false;
   if(!window.Html5Qrcode)throw Error('Camera scanner unavailable. You can paste a ticket URL below.');
   scanner=new Html5Qrcode('reader');await scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:240,height:240}},scan,()=>{});
 }catch(err){$('#authMessage').textContent=err.message;}
}
$('#manual').addEventListener('submit',e=>{e.preventDefault();const value=$('#code').value.trim();if(value)scan(value);});
window.addEventListener('pagehide',()=>scanner?.stop().catch(()=>{}));window.addEventListener('load',start);