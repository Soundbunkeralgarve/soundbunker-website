(() => {
const $=q=>document.querySelector(q);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let supabase,token,account;
function notify(s,error=false){const n=$('#notice');n.textContent=s;n.style.background=error?'#6a233b':'#2f2242';}
async function request(body){
 const r=await fetch('/api/organiser',{method:body?'POST':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});
 const data=await r.json();if(!r.ok)throw Error(data.error||'Request failed');return data;
}
const localDate=(value,zone)=> {
 if(!value)return '—';
 return new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:zone||'Europe/Lisbon'}).format(new Date(value));
};
async function refresh(){
 const data=await request();account=data.organiser;
 $('#register').hidden=!!account;$('#workspace').hidden=!account;
 if(!account){notify('Create a free organiser account to get started.');return;}
 $('#orgName').textContent=account.display_name;
 $('#orgState').textContent='Country '+account.country_code+' · Review status: '+account.status+' · Stripe: '+(account.stripe_connected?'Connected':'Not connected');
 const currency=account.country_code==='GB'?'GBP':'EUR';
 $('#priceLabel').firstChild.textContent='Ticket price ('+currency+')';
 const list=data.events||[];
 $('#tierEvent').innerHTML=list.filter(e=>e.status==='draft').map(e=>'<option value="'+esc(e.id)+'">'+esc(e.title)+'</option>').join('');
 $('#myEvents').innerHTML=list.length?list.map(e=>'<article class="event-info" style="background:#241832;border:1px solid #ffffff33"><span class="pill">'+esc(e.status)+'</span><h3>'+esc(e.title)+'</h3><p>'+esc(e.event_kind)+' • '+esc(e.venue)+'</p><p>'+esc(localDate(e.starts_at,e.venue_timezone))+' • '+esc(e.currency.toUpperCase())+'</p><p>'+e.tiers.map(t=>esc(t.name)+' · '+esc(String(t.quantity_total))+' available').join(', ')+'</p><p>Ticket sales: '+(e.status==='published'?'See your event dashboard':'not open — draft')+'</p></article>').join(''):'<div class="empty">Your first event starts here. Create a draft above.</div>';
 notify('Organiser dashboard loaded. Events remain private until verification and publishing.');
}
async function submit(body) {try{notify('Saving…');await request(body);await refresh();}catch(e){notify(e.message,true);}}
$('#registerForm').addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.target);submit({action:'register',displayName:d.get('displayName'),country:d.get('country'),acceptTerms:d.get('acceptTerms')==='on'});});
$('#eventForm').addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target));const dt=x=>x?new Date(x).toISOString():null;submit({action:'event',...d,startsAt:dt(d.startsAt),endsAt:dt(d.endsAt)});});
$('#tierForm').addEventListener('submit',e=>{e.preventDefault();const d=new FormData(e.target);submit({action:'tier',eventId:d.get('eventId'),name:d.get('name'),priceCents:Math.round(Number(d.get('price'))*100),capacity:Number(d.get('capacity'))});});
async function boot(){
 try{const cfg=await fetch('/api/supabase-config').then(r=>r.json());if(!window.supabase)throw Error('Sign-in service unavailable');
 supabase=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});
 const {data:{session}}=await supabase.auth.getSession();
 if(!session){$('#guest').hidden=false;notify('Sign in to get started.');return;}
 token=session.access_token;await refresh();
 }catch(e){notify(e.message,true);}
}
window.addEventListener('load',boot);
})();