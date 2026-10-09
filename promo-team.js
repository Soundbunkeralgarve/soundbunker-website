(async()=>{const $=q=>document.querySelector(q),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));let sb;
function status(s,error=false){$('#promoStatus').textContent=s;$('#promoStatus').style.borderColor=error?'#f0b1be':'#e6e6ef';}
async function request(body){const {data:{session}}=await sb.auth.getSession();if(!session)throw Error('Please sign in first');const res=await fetch(body?'/api/event-promo-team':'/api/event-promo-team?mode=mine',{method:body?'POST':'GET',headers:{authorization:'Bearer '+session.access_token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store'});const data=await res.json();if(!res.ok)throw Error(data.error||'Request failed');return data;}
async function load(){
 const data=await request();const teams=data.teams||[];
 $('#promoterTeams').innerHTML=teams.map(t=>{
 const progress=Math.min(100,Math.round(100*t.available_points/t.points_per_free_ticket));
 const event=t.event||{};
 return '<article class="event-card">'+(event.image_url&&event.image_url.startsWith('https://')?'<div class="event-art"><img src="'+esc(event.image_url)+'" alt="Event artwork"></div>':'')+'<div class="event-info"><span class="tb-chip">'+esc(t.status)+'</span><h3>'+esc(event.title||'Your event')+'</h3><p>Promo code: <strong>'+esc(t.code)+'</strong></p><p>'+t.points_per_paid_ticket+' points per paid ticket · '+t.points_per_free_ticket+' points for a free ticket</p><div><div class="tb-events-row"><strong>'+t.available_points+' verified points</strong><span class="tb-muted">'+progress+'%</span></div><div role="progressbar" aria-valuenow="'+t.available_points+'" aria-valuemin="0" aria-valuemax="'+t.points_per_free_ticket+'" style="height:9px;border-radius:9px;background:#ece4f6;overflow:hidden"><div style="height:100%;width:'+progress+'%;background:#7439ca"></div></div></div><p>Sales tracking &amp; ticket redemption are currently paused for beta.</p><button class="outline" type="button" data-code="'+esc(t.code)+'">Copy promo code</button></div></article>';
 }).join('')||'<div class="empty">No promoter teams claimed yet. Ask your organiser for an invitation and use your verified email to claim it.</div>';
 status(teams.length?'Your ambassador dashboard is ready. Sales counting begins once event checkout launches.':'Your promo-team account is ready.');
}
$('#promoterTeams').addEventListener('click',async e=>{const code=e.target.closest('[data-code]')?.dataset.code;if(!code)return;try{await navigator.clipboard.writeText(code);status('Code copied: '+code);}catch{status('Your code is '+code);}});
$('#claimForm').addEventListener('submit',async e=>{e.preventDefault();try{const d=new FormData(e.currentTarget);await request({action:'claim',eventId:d.get('eventId'),code:d.get('code')});$('#promoterClaim').hidden=true;await load();status('Invitation claimed. Your personal code is now connected to this account.');}catch(error){status(error.message,true);}});
try{
 const config=await fetch('/api/supabase-config').then(r=>r.json());if(!config.url||!config.key||!window.supabase)throw Error('Login service unavailable');
 sb=window.supabase.createClient(config.url,config.key,{auth:{persistSession:true,autoRefreshToken:true}});
 const {data:{session}}=await sb.auth.getSession();
 if(!session){$('#promoterGuest').hidden=false;status('Sign in with the email address invited by your organiser.');return;}
 const params=new URLSearchParams(location.search),id=params.get('eventId'),code=params.get('code');
 if(id&&code){$('#promoterClaim').hidden=false;$('#claimEventId').value=id;$('#claimCode').value=code;}
 await load();
}catch(error){status(error.message,true);}
})();