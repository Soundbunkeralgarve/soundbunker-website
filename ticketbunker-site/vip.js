// TicketBunker VIP page: shows your membership and lets you register interest, join (once
// sales open) or manage billing. Prices on the page come from the server when signed in.
import {$,api,authClient,escapeHtml as esc,money} from './shared.js';
const params=new URLSearchParams(location.search);
let currency=(Intl.DateTimeFormat().resolvedOptions().timeZone||'')==='Europe/London'?'gbp':'eur',state=null,sb=null,token='';
const status=html=>{$('#vip-status').innerHTML=html;};
const day=iso=>iso?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric'}).format(new Date(iso)):'';
const PRICES={monthly:{eur:499,gbp:499},yearly:{eur:4900,gbp:4900}};

function showPrices(){
 const prices=state?.prices||PRICES;
 document.querySelectorAll('[data-cur]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.cur===currency)));
 for(const plan of ['monthly','yearly'])$(`[data-price="${plan}"]`).innerHTML=esc(money(prices[plan][currency],currency).replace(/\.00$/,''))+`<small>/${plan==='yearly'?'year':'month'}</small>`;
}
function renderGuestlist(){
 const box=$('#vip-guestlist'),list=state?.member?state.guestlist||[]:null;
 box.hidden=!list;if(!list)return;
 $('#gl-list').innerHTML=list.length?list.map(g=>`<article class="gl-item"><div><b>${esc(g.event.title)}</b><span>${esc([day(g.event.startsAt),g.event.venue,g.event.city].filter(Boolean).join(' · '))}</span></div>${g.claimed?'<em class="gl-done">✓ On the list</em>':g.spotsLeft>0?`<button type="button" class="vip-btn" data-claim="${esc(g.allocationId)}">Claim my spot · ${g.spotsLeft} left</button>`:'<em>All spots taken</em>'}</article>`).join(''):'<p class="vip-small">No VIP guestlist nights yet. New ones appear here as partner venues add them.</p>';
}
function render(){
 showPrices();renderGuestlist();
 const buttons=[...document.querySelectorAll('[data-plan]')];
 if(!token){
  status(`<p>Sign in or create a free account to join VIP.</p><a class="vip-btn" href="/login?role=buyer&next=%2Fvip">Sign in to join</a>`);
  buttons.forEach(b=>{b.textContent='Sign in to join';b.dataset.go='signin';});return;
 }
 if(state.member){
  const until=state.renewsOn?`Renews ${esc(day(state.renewsOn))}.`:`VIP until ${esc(day(state.endsOn))}.`;
  status(`<p class="vip-badge-line"><span class="vip-badge">VIP</span> You're a TicketBunker VIP. ${until}${state.status==='past_due'?' <strong>Your last payment didn’t go through; update your card to keep VIP.</strong>':''}</p>${state.canManage?'<button type="button" class="vip-btn ghost" id="vip-manage">Manage or cancel</button>':''}`);
  $('#vip-manage')?.addEventListener('click',()=>go({action:'manage'}));
  buttons.forEach(b=>{b.disabled=true;b.textContent='You’re VIP';});return;
 }
 if(!state.salesOpen){
  status(state.interested?'<p>You’re on the list. We’ll email you the moment VIP opens.</p>':'<p>VIP opens soon. Be first in.</p><button type="button" class="vip-btn" id="vip-interest">Tell me when it opens</button>');
  $('#vip-interest')?.addEventListener('click',()=>go({action:'interest'}));
  buttons.forEach(b=>{b.textContent=state.interested?'Opening soon':'Tell me when it opens';b.dataset.go=state.interested?'':'interest';b.disabled=!!state.interested;});return;
 }
 status(params.get('joined')?'<p>Payment received. Your VIP is switching on; this takes a moment.</p>':'<p>Pick monthly or yearly below.</p>');
 buttons.forEach(b=>{b.disabled=false;b.dataset.go='checkout';b.textContent='Join '+b.dataset.plan;});
}
async function go(body){
 try{
  const result=await api('ticketbunker-vip',body,token);
  if(result.url){location.href=result.url;return;}
  state=result;render();
 }catch(e){status(`<p class="vip-error">${esc(e.message)}</p>`);}
}
document.addEventListener('click',async e=>{
 const claim=e.target.closest('[data-claim]');
 if(claim){claim.disabled=true;claim.textContent='Claiming…';
  try{let r;try{r=await api('ticketbunker-vip',{action:'guestlist',allocationId:claim.dataset.claim,requestId:crypto.randomUUID()},token);}
   catch(err){if(!/name/i.test(err.message))throw err;const name=prompt('Your name for the door list');if(!name)throw err;r=await api('ticketbunker-vip',{action:'guestlist',allocationId:claim.dataset.claim,requestId:crypto.randomUUID(),name},token);}
   state={...state,guestlist:r.guestlist};renderGuestlist();status(`<p>You\u2019re on the guestlist. ${r.emailSent?'Your pass is in your email and':'Your pass is'} in <a href="/my-tickets">My tickets</a>.</p>`);}
  catch(err){claim.disabled=false;claim.textContent='Try again';status(`<p class="vip-error">${esc(err.message)}</p>`);}
  return;}
 const cur=e.target.closest('[data-cur]');if(cur){currency=cur.dataset.cur;showPrices();return;}
 const b=e.target.closest('[data-plan]');if(!b)return;
 if(b.dataset.go==='signin')location.href='/login?role=buyer&next=%2Fvip';
 else if(b.dataset.go==='interest')go({action:'interest'});
 else if(b.dataset.go==='checkout')go({action:'checkout',plan:b.dataset.plan,currency});
});
showPrices();
(async()=>{
 try{
  sb=await authClient();
  const {data}=await sb.auth.getSession();token=data.session?.access_token||'';
  if(token){state=await api('ticketbunker-vip',null,token);
   // Straight back from Stripe: the webhook may take a few seconds to switch VIP on.
   for(let n=0;params.get('joined')&&!state.member&&n<6;n++){render();await new Promise(r=>setTimeout(r,2500));state=await api('ticketbunker-vip',null,token);}
  }
  render();
 }catch(e){token='';render();}
})();
