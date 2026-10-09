(async()=>{const $=q=>document.querySelector(q),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const status=s=>$('#walletStatus').textContent=s;
try{
 const cfg=await fetch('/api/supabase-config').then(r=>r.json());
 const sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});
 const {data:{session}}=await sb.auth.getSession();
 if(!session){$('#walletGuest').hidden=false;status('Sign in to view confirmed tickets.');return;}
 $('#walletSignout').hidden=false;$('#walletSignout').onclick=async()=>{await sb.auth.signOut();location.assign('/ticket-login?role=attendee');};
 const r=await fetch('/api/my-event-tickets',{headers:{authorization:'Bearer '+session.access_token},cache:'no-store'}),data=await r.json();
 if(!r.ok)throw Error(data.error||'Unable to retrieve tickets');
 const tickets=data.tickets||[];
 status(tickets.length?'You have '+tickets.length+' confirmed ticket'+(tickets.length===1?'':'s')+'.':'No confirmed tickets yet. As ticket sales are disabled in beta, your wallet will fill up when the platform opens.');
 $('#walletTickets').innerHTML=tickets.map(t=>'<article class="event-card">'+(t.poster&&t.poster.startsWith('https://')?'<div class="event-art"><img src="'+esc(t.poster)+'" alt="Event artwork"></div>':'')+'<div class="event-info"><span class="tb-chip">'+(t.used?'Already checked in':'Your admission ticket')+'</span><h3>'+esc(t.title)+'</h3><p>'+esc(t.venue)+' · '+esc(new Date(t.date).toLocaleString('en-GB'))+'</p><p>'+esc(t.tier)+'</p><a class="solid" href="'+esc(t.url)+'">View ticket and QR →</a></div></article>').join('');
}catch(error){status(error.message||'Unable to access wallet');}})();