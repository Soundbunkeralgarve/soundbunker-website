import {$,api,escapeHtml as esc,safeUrl,date} from './shared.js';
import {normalizeBusinessWebsite} from './profile-fields.js';
let currentEvents=[],profileLoaded=false;
async function token(){const sb=window.ticketbunkerAuth;if(!sb)throw Error('Please wait for sign-in.');const {data}=await sb.auth.getSession();if(!data.session)throw Error('Please sign in again.');return data.session.access_token;}
async function profile(){
 try{const d=await api('organiser-profile',null,await token()),o=d.organiser,f=$('#profile-form');f.elements.displayName.value=o.display_name;for(const field of ['legalName','contactName','email','phone','website','address','taxNumber','bio'])f.elements[field].value=o.public_profile?.[field]||'';$('#profile-status').textContent='';profileLoaded=true;}catch(e){$('#profile-status').textContent=e.message;}
}
$('#profile-form').onsubmit=async e=>{
 e.preventDefault();const b=e.submitter||e.target.querySelector('button[type="submit"]');b.disabled=true;$('#notice').hidden=true;$('#profile-status').textContent='Saving your details…';
 try{
  const body=Object.fromEntries(new FormData(e.target));body.website=normalizeBusinessWebsite(body.website);e.target.elements.website.value=body.website;
  const d=await api('organiser-profile',body,await token());
  $('#profile-status').textContent='Business details saved successfully.';profileLoaded=true;
  window.dispatchEvent(new CustomEvent('ticketbunker:profile-saved',{detail:d.organiser}));
 }catch(err){$('#profile-status').textContent=err.message;}finally{b.disabled=false;$('#profile-status').scrollIntoView({behavior:'smooth',block:'nearest'});}
};
async function promotions(){
 try{const d=await api('organiser',null,await token());currentEvents=(d.events||[]).filter(e=>e.status==='draft');$('#featured-event').innerHTML='<option value="">Choose an event draft</option>'+currentEvents.map(e=>`<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('');$('#featured-status').textContent=currentEvents.length?'Create your campaign from your event’s saved artwork and details.':'Save an event draft first to request featured placement.';}catch(e){$('#featured-status').textContent=e.message;}
}
$('#featured-event').onchange=()=>{
 const e=currentEvents.find(e=>e.id===$('#featured-event').value);if(!e){$('#featured-preview').replaceChildren();return;}
 $('#featured-preview').innerHTML=`<div class="featured-preview-head"><img src="/brand-compact.png" alt="TicketBunker"><span>YOUR PROMOTIONAL EMAIL</span></div>${safeUrl(e.image_url)?`<img class="featured-poster" src="${esc(safeUrl(e.image_url))}" alt="${esc(e.title)} poster">`:''}<div class="featured-preview-body"><span class="eyebrow">FEATURED EVENT</span><h2>${esc(e.title)}</h2><p>${esc(date(e.starts_at,e.venue_timezone))} · ${esc(e.venue)}</p>${safeUrl(e.event_logo_url)?`<img class="promoter-logo" src="${esc(safeUrl(e.event_logo_url))}" alt="Promoter logo">`:''}<p>${esc(e.description)}</p><span class="primary">View event &amp; tickets →</span><p class="preview-note">Powered by SoundBunker Algarve · Subscriber email with unsubscribe link.</p></div>`;
 $('#featured-status').textContent=(e.currency==='gbp'?'£49':'€59')+' plus applicable tax · '+(e.showcase?'Request '+e.showcase.status.replaceAll('_',' '):'No placement requested yet')+'.';
};
$('#featured-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const eventId=$('#featured-event').value;if(!eventId)throw Error('Choose an event first.');const d=await api('organiser',{action:'featureRequest',eventId},await token());$('#featured-status').textContent=d.message||'Featured placement requested. No payment has been taken and no email sent.';}catch(err){$('#featured-status').textContent=err.message;}finally{b.disabled=false;}};
window.addEventListener('ticketbunker:ready',profile);
window.addEventListener('ticketbunker:page',e=>{if(e.detail==='profile'&&!profileLoaded)profile();if(e.detail==='promotions')promotions();});
