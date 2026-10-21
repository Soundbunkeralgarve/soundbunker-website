import {$,api,escapeHtml as esc,safeUrl,date} from './shared.js';
import {preferenceFields,readPreferences} from './promo-options.js';
import {normalizeBusinessWebsite} from './profile-fields.js';
let currentEvents=[],profileLoaded=false,targeting=[];
preferenceFields($('#promotion-fields'),{},true);
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
 try{const [d,t]=await Promise.all([api('organiser',null,await token()),api('event-promotion',null,await token())]);targeting=t.targeting||[];currentEvents=(d.events||[]).filter(e=>['draft','published'].includes(e.status)&&!e.internal_free_test&&!e.public_beta_test&&Date.parse(e.starts_at)>Date.now());$('#featured-event').innerHTML='<option value="">Choose a future event</option>'+currentEvents.map(e=>`<option value="${esc(e.id)}">${esc(e.title)}</option>`).join('');$('#featured-status').textContent=currentEvents.length?'Choose your event, location and music styles.':'Create a future event first.';}catch(e){$('#featured-status').textContent=e.message;}
}
$('#featured-event').onchange=()=>{
 const e=currentEvents.find(e=>e.id===$('#featured-event').value);if(!e){$('#featured-preview').replaceChildren();return;}
 $('#request-featured').checked=!!e.showcase;
 const tags=targeting.find(t=>t.event_id===e.id);preferenceFields($('#promotion-fields'),{country:e.country_code,regions:tags?[tags.region]:[],genres:tags?.genres||[]},true);
 $('#featured-preview').innerHTML=`<div class="featured-preview-head"><img src="/brand-compact.png" alt="TicketBunker"><span>YOUR EVENT IN WEEKLY PICKS</span></div>${safeUrl(e.image_url)?`<img class="featured-poster" src="${esc(safeUrl(e.image_url))}" alt="${esc(e.title)} poster">`:''}<div class="featured-preview-body"><h2>${esc(e.title)}</h2><p>${esc(date(e.starts_at,e.venue_timezone))} · ${esc(e.venue)}</p><p>${esc(e.description)}</p><span class="primary">View event &amp; tickets →</span><p class="preview-note">Matched to location and music interests · Unsubscribe in every email.</p></div>`;
 $('#featured-status').textContent=(e.currency==='gbp'?'£49':'€59')+' including applicable VAT / IVA · '+(e.showcase?'Featured request: '+e.showcase.status.replaceAll('_',' '):'No featured placement requested yet')+'.';
};
$('#featured-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const eventId=$('#featured-event').value;if(!eventId)throw Error('Choose an event first.');const d=await api('event-promotion',{...readPreferences($('#promotion-fields')),eventId,requestFeatured:$('#request-featured').checked},await token());$('#featured-status').textContent=d.message;const savedId=eventId;await promotions();$('#featured-event').value=savedId;$('#featured-event').dispatchEvent(new Event('change'));$('#featured-status').textContent=d.message;}catch(err){$('#featured-status').textContent=err.message;}finally{b.disabled=false;}};
window.addEventListener('ticketbunker:ready',()=>{profile();if(!$('#page-promotions').hidden)promotions();});
window.addEventListener('ticketbunker:page',e=>{if(e.detail==='profile'&&!profileLoaded)profile();if(e.detail==='promotions')promotions();});


async function invoices(){
 const root=$('#organiser-invoice-list');if(!root)return;root.textContent='Loading invoices…';
 try{
  const data=await api('organiser-invoices',null,await token());root.replaceChildren();
  if(!data.invoices.length)root.textContent='Your organiser invoices appear here after a service payment is processed.';
  for(const invoice of data.invoices){
   const row=document.createElement('p'),title=document.createElement('strong');title.textContent=(invoice.document_number||invoice.description)+' · '+new Intl.NumberFormat('en-GB',{style:'currency',currency:invoice.currency.toUpperCase()}).format(invoice.amount_cents/100);row.append(title,document.createElement('br'));
   row.append(document.createTextNode(invoice.issued?(invoice.paid_cents>=invoice.amount_cents?'Paid. ':'Payment due. '):'Invoice being prepared. '));
   if(invoice.url){const u=new URL(invoice.url);if(u.protocol==='https:'&&u.hostname.endsWith('.invoicexpress.com')&&u.pathname.startsWith('/documents/')){const a=document.createElement('a');a.className='ghost';a.textContent='View / download invoice ↗';a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';row.append(a);}}
   root.append(row);
  }
 }catch(error){root.textContent=error.message;}
}
window.addEventListener('ticketbunker:page',e=>{if(e.detail==='invoices')invoices();});
window.addEventListener('ticketbunker:ready',()=>{if(!$('#page-invoices')?.hidden)invoices();});
