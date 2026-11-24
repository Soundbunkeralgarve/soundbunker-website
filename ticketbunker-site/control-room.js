import {financeWorkspace} from './finance-workspace.js';
import {ownerWorkspace} from './owner-workspace.js';
import {authClient,api,escapeHtml as esc,money} from './shared.js';
import {plans,reservationUsageTerms} from './pricing-rules.js';
const $=s=>document.querySelector(s);
let sb;
const finance=financeWorkspace({token:()=>token(),refresh:()=>refresh()});
const workspace=ownerWorkspace({token:()=>token(),refresh:()=>refresh()});
async function token(){const {data,error}=await sb.auth.getSession();if(error||!data.session)throw Error('Sign in to your owner account.');return data.session.access_token;}
async function refresh(){
  const data=await api('ticketbunker-admin',null,await token());
  workspace.render(data);finance.render(data);
  $('#admin-content').hidden=false;$('#admin-login').hidden=true;$('#admin-status').textContent='';$('#admin-email').textContent='Signed in as '+data.email;
  $('#code-list').innerHTML=data.codes.length?data.codes.map(c=>`<article class="commercial-record"><h3>${esc(c.code)}</h3><p>${c.kind==='percent'?esc(c.value)+'%':money(c.value,c.currency)} off · ${c.active?'Enabled':'Disabled'}<br>Maximum ${esc(c.max_uses)} reservations · expires ${esc(new Date(c.expires_at).toLocaleString('en-GB'))}</p><button class="secondary" type="button" data-code="${esc(c.id)}" data-active="${!c.active}">${c.active?'Disable code':'Enable code'}</button></article>`).join(''):'<p>No discount codes yet.</p>';
  $('#admin-ads').innerHTML=(data.ads||[]).length?data.ads.map(adRecord).join(''):'<p class="muted">No adverts yet. Share theticketbunker.com/advertise with venues and promoters.</p>';
  $('#admin-reservations').innerHTML=data.reservations.length?data.reservations.map(r=>`<article class="commercial-record"><h3>${esc(r.contact_email)}</h3><p>${esc(plans[r.plan]?.label||'Large-event deposit + additional sales')} · ${esc(r.event_count)} event(s) · ${esc(r.status.toUpperCase())}<br>${money(r.total_cents,r.currency)} including applicable VAT / IVA${r.rate_cents?' · '+esc(reservationUsageTerms(r)):''}<br>Discount: ${money(r.discount_cents,r.currency)}<br>Quote expires ${esc(new Date(r.quote_valid_until).toLocaleDateString('en-GB'))}<br>Reference ${esc(r.id)}</p><p>${esc(r.notes)}</p>${r.status==='requested'&&Date.parse(r.quote_valid_until)>Date.now()?`<div class="commercial-buttons"><button class="primary" type="button" data-reservation="${esc(r.id)}" data-status="approved">Approve quote</button><button class="secondary" type="button" data-reservation="${esc(r.id)}" data-status="cancelled">Cancel request</button></div>`:''}</article>`).join(''):'<p>No pre-bookings yet.</p>';
}
const AD_PLACES={city:'City page',home:'Homepage',everywhere:'Homepage + city pages'};
const AD_STATUS={review:'Waiting for review',approved:'Approved',refunded:'Turned down · refunded',expired:'Finished'};
function adRecord(a){
  const live=a.status==='approved'&&Date.parse(a.starts_at)<=Date.now()&&Date.parse(a.ends_at)>Date.now();
  return `<article class="commercial-record"><h3>${esc(a.business_name)} · ${esc(a.headline)}</h3><p>${esc(AD_PLACES[a.package]||a.package)}${a.city_slug?' ('+esc(a.city_slug)+')':''} · ${esc(a.country_code)} · ${a.weeks} week${a.weeks>1?'s':''} · ${money(a.amount_cents,a.currency)} · ${live?'Live now':esc(AD_STATUS[a.status]||a.status)}${a.starts_at?' · '+esc(a.starts_at.slice(0,10))+' to '+esc(a.ends_at.slice(0,10)):' · wants '+esc(a.requested_start)}</p><p>${esc(a.body)}</p><p><a href="${esc(a.link_url)}" target="_blank" rel="noopener">${esc(a.link_url)}</a> · <a href="${esc(a.image_url)}" target="_blank" rel="noopener">picture</a> · ${esc(a.contact_email)}</p>${a.status==='review'?`<div class="record-actions"><button type="button" data-ad="${esc(a.id)}" data-decision="approve">Approve</button><button type="button" class="secondary" data-ad="${esc(a.id)}" data-decision="refund">Turn down &amp; refund</button></div>`:''}</article>`;
}
function discountFields(){const fixed=$('#code-form').elements.kind.value==='fixed',amount=$('#code-form').elements.amount;amount.max=fixed?'10000':'100';amount.step=fixed?'.01':'1';$('#code-form').elements.currency.disabled=!fixed;$('#amount-help').textContent=fixed?'Amount in the selected currency':'Percentage off the listing fee including applicable VAT';}
$('#code-form').elements.kind.onchange=discountFields;discountFields();
$('#code-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;$('#code-status').textContent='Saving…';try{const f=e.currentTarget.elements;await api('ticketbunker-admin',{action:'createCode',code:f.code.value,kind:f.kind.value,value:f.kind.value==='fixed'?Math.round(Number(f.amount.value)*100):Number(f.amount.value),currency:f.currency.value,maxUses:Number(f.maxUses.value),expiresAt:new Date(f.expiresAt.value).toISOString()},await token());$('#code-status').textContent='Discount code created.';await refresh();}catch(err){$('#code-status').textContent=err.message;}finally{b.disabled=false;}};
$('#admin-content').addEventListener('click',async e=>{
  const ad=e.target.closest('[data-ad]');
  if(ad){
    if(ad.dataset.decision==='refund'&&!confirm('Turn this advert down and refund the advertiser in full? This cannot be undone.'))return;
    const note=ad.dataset.decision==='refund'?prompt('Reason to tell the advertiser (optional)')||'':'';
    ad.disabled=true;
    try{await api('ticketbunker-admin',{action:'reviewAd',id:ad.dataset.ad,decision:ad.dataset.decision,note},await token());await refresh();}catch(err){$('#admin-status').textContent=err.message;ad.disabled=false;}
    return;
  }
  const b=e.target.closest('[data-code],[data-reservation]');if(!b)return;b.disabled=true;
  try{await api('ticketbunker-admin',b.dataset.code?{action:'toggleCode',id:b.dataset.code,active:b.dataset.active==='true'}:{action:'reviewReservation',id:b.dataset.reservation,status:b.dataset.status},await token());await refresh();}catch(err){$('#admin-status').textContent=err.message;b.disabled=false;}
});
$('#admin-refresh').onclick=()=>refresh().catch(err=>$('#admin-status').textContent=err.message);
$('#admin-signout').onclick=async()=>{await sb.auth.signOut();location.replace('/login?next=%2Fcontrol-room');};
(async()=>{try{sb=await authClient();const {data}=await sb.auth.getSession();if(!data.session){$('#admin-status').textContent='Sign in with your authorised owner email.';$('#admin-login').hidden=false;return;}await refresh();}catch(err){$('#admin-content').hidden=true;$('#admin-status').textContent=err.message;$('#admin-login').hidden=false;}})();
