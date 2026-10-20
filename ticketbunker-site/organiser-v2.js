(()=>{
'use strict';
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s)),esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const LEGACY_CUTOFF='2026-10-11T16:00:00Z';
let sb,session,token,profile,events=[],currentDraft=null,currentPage=new URLSearchParams(location.search).has('hub')?'hub':new URLSearchParams(location.search).has('capacity')?'capacity':'overview',reportCache={},latestReport=null;
let savedEventInput=null,posterUploaded=false;
let billingComplete=false,billingRecord=null,connectState=null,connectBusy=false;
let connectComponent=null;
let feedbackAnchor=null;
document.addEventListener('submit',e=>{feedbackAnchor=e.submitter||e.target.querySelector('button[type=submit],button:not([type])');},true);
document.addEventListener('click',e=>{const button=e.target.closest('button');if(button)feedbackAnchor=button;},true);
function notice(msg,bad=false,anchor=feedbackAnchor){
 const el=$('#notice');
 const visible=node=>node?.isConnected&&!node.closest('[hidden],#sidebar,.app-header');
 if(!visible(anchor))anchor=$('.page:not([hidden]) .panel')||$('#onboarding:not([hidden])');
 if(anchor&&anchor!==el){
  const row=anchor.closest('.button-row');
  const target=row||anchor;
  if(target.matches('.panel,#onboarding'))target.prepend(el);else target.before(el);
 }
 el.hidden=false;el.classList.toggle('error',bad);el.setAttribute('role',bad?'alert':'status');el.textContent=msg;
 if(bad){el.tabIndex=-1;el.focus({preventScroll:true});}
 const rect=el.getBoundingClientRect();if(rect.top<90||rect.bottom>innerHeight-20)el.scrollIntoView({behavior:'smooth',block:'center'});
}
function eventError(err){
 const form=$('#event-form'),field=err.details?.field,control=field?form.elements.namedItem(field):null;
 if(control){
  const hint=document.createElement('small');hint.id='event-field-error';hint.className='field-error';hint.textContent=err.message;control.after(hint);
  control.setAttribute('aria-invalid','true');control.setAttribute('aria-describedby',hint.id);
  notice(err.message,true,$('#save-event'));control.focus();control.scrollIntoView({behavior:'smooth',block:'center'});
 }else notice(err.message,true,$('#save-event'));
}
function clearEventError(){
 $('#event-field-error')?.remove();$$('#event-form [aria-invalid]').forEach(el=>{el.removeAttribute('aria-invalid');el.removeAttribute('aria-describedby')});$('#notice').hidden=true;
}

async function api(url,body){const liveSession=await sb.auth.getSession();if(!liveSession.data.session)throw Error('Your session expired. Please sign in again.');token=liveSession.data.session.access_token;const r=await fetch(url,{method:body?'POST':'GET',cache:'no-store',headers:{authorization:'Bearer '+token,...body?{'content-type':'application/json'}:{}},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});let d;try{d=await r.json()}catch{throw Error('The service returned an unreadable response. Please retry.')}if(!r.ok){const error=Error(d.error||'Request failed ('+r.status+')');error.code=d.code;error.details=d;throw error;}return d;}
function page(name){if(!profile&&name!=='branding'){return showOnboarding();}currentPage=name;$('#notice').hidden=true;$$('.page').forEach(x=>x.hidden=x.id!=='page-'+name);$('#onboarding').hidden=true;$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.page===name));$('#sidebar').classList.remove('open');window.scrollTo(0,0);if(name==='create')renderBranding();if(name==='overview')renderOverview();if(name==='events')renderEvents();if(name==='branding')renderBranding();if(name==='profile')renderBillingForms();if(name==='verification')loadStripeStatus();if(name==='reports')loadReportPage();if(name==='staff')loadStaffPage();if(name==='hub')loadHubPage();if(name==='street')loadStreetPage();if(name==='guests')loadGuestPage();if(name==='capacity')loadCapacityPage();window.dispatchEvent(new CustomEvent('ticketbunker:page',{detail:name}));}
$$('[data-page]').forEach(x=>x.onclick=()=>{if(x.dataset.page==='create')startNewEvent();page(x.dataset.page)});$$('[data-go]').forEach(x=>x.onclick=()=>{if(x.dataset.go==='create')startNewEvent();page(x.dataset.go)});$('#menu-btn').onclick=()=>{const yes=$('#sidebar').classList.toggle('open');$('#menu-btn').setAttribute('aria-expanded',String(yes))};
function money(n,c='eur'){return new Intl.NumberFormat('en-GB',{style:'currency',currency:c==='gbp'?'GBP':'EUR'}).format(Number(n||0)/100);}
function safeEvents(){return events.filter(e=>(e.internal_free_test!==true||e.wallet_test===true)&&(!e.created_at||Date.parse(e.created_at)>=Date.parse(LEGACY_CUTOFF)));}
function isLive(e){return e.status==='published'&&Date.parse(e.starts_at)>Date.now()-36*3600000}
function options(arr,selected=''){return arr.map(e=>'<option value="'+esc(e.id)+'"'+(e.id===selected?' selected':'')+'>'+esc(e.title)+'</option>').join('')}
function empty(msg){return '<div class="empty">'+esc(msg)+'</div>'}
function drawEvent(e){return '<div class="event-row">'+(e.image_url?'<img class="thumb" src="'+esc(e.image_url)+'" alt="Event poster">':'<img class="thumb" src="/brand-icon.png" alt="">')+'<div class="event-detail"><span class="eyebrow">'+esc(e.status==='published'?'Published':e.publish_requested_at?'Publication pending':'Draft')+'</span><h3>'+esc(e.title)+'</h3><p>'+esc(e.venue)+' · '+new Date(e.starts_at).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})+'</p></div><div class="event-actions"><button class="ghost" data-report="'+esc(e.id)+'" type="button">Reports ↗</button>'+(e.status==='published'&&e.slug?'<a class="ghost" href="/event/'+encodeURIComponent(e.slug)+'" target="_blank" rel="noopener">View event page ↗</a><button class="primary" type="button" data-promote="'+esc(e.id)+'">Share &amp; promote ↗</button>':'')+(e.status==='draft'?'<button class="ghost" type="button" data-tickets="'+esc(e.id)+'">Tickets ↗</button>':'')+'</div></div>';}
function wireRows(root){root.querySelectorAll('[data-promote]').forEach(b=>b.onclick=async()=>{const event=events.find(e=>e.id===b.dataset.promote);if(!event)return;const {sharePanel,wireShare}=await import('./event-share.js');let panel=document.getElementById('event-social-tools');if(!panel){panel=document.createElement('dialog');panel.id='event-social-tools';document.body.append(panel);}panel.innerHTML='<form method="dialog"><button class="ghost">Close ×</button></form>'+sharePanel(event);wireShare(panel.querySelector('.social-share'),event);panel.showModal();});root.querySelectorAll('[data-report]').forEach(b=>b.onclick=()=>{page('reports');$('#report-event').value=b.dataset.report;$('#report-event').dispatchEvent(new Event('change'))});root.querySelectorAll('[data-tickets]').forEach(b=>b.onclick=()=>{openDraftTickets(events.find(e=>e.id===b.dataset.tickets));});}
async function loadCapacityNotifications(){try{const r=await api('/api/event-capacity');const seen=new Set();const alerts=r.alerts.filter(a=>!seen.has(a.event_id)&&seen.add(a.event_id));$('#capacity-banner').hidden=!alerts.length;$('#capacity-banner').innerHTML=alerts.map(a=>'<p><strong>'+esc(a.title)+'</strong> reached '+a.threshold+'% allocation ('+a.used+' / '+a.capacity+'). <a href="/organiser?capacity='+esc(a.event_id)+'">Review current capacity →</a></p>').join('');}catch{/* Capacity detail remains available from navigation. */}}
async function loadGuestPage(){const list=safeEvents().filter(e=>isLive(e)&&!e.public_beta_test);$('#guests-event').innerHTML=options(list,$('#guests-event').value);await fetchGuestPage();}
async function fetchGuestPage(){const id=$('#guests-event').value;$('#guests-roster').textContent='';$('#guests-form').hidden=!id;if(!id){$('#guests-roster').innerHTML=empty('Publish an event to allocate guest passes.');return;}
 try{const [r,c]=await Promise.all([api('/api/event-guest-list?eventId='+id),api('/api/event-capacity?eventId='+id)]);$('#guests-tier').innerHTML=c.tiers.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join('');$('#guests-roster').innerHTML=r.allocations.length?r.allocations.map(a=>{const guests=r.guests.filter(g=>g.allocation_id===a.id);const used=guests.filter(g=>['paid','needs_attention'].includes(g.sb_event_orders?.status)).length;return '<div class="roster-line" data-allocation="'+esc(a.id)+'"><h3>'+esc(a.artist_name)+'</h3><p>'+esc(a.artist_email)+' · '+esc(a.sb_event_tiers?.name)+' · '+used+' / '+a.quota+' issued'+(a.revoked_at?' · Revoked':'')+'</p>'+(!a.revoked_at?'<form class="inline-form" data-limit><label>Pass limit<input name="quota" type="number" min="'+Math.max(1,used)+'" max="2000" value="'+a.quota+'" required></label><button class="ghost">Save limit</button></form><button class="ghost" data-revoke>Revoke artist access</button>'+(!a.invitation_sent_at?'<button class="ghost" data-invite>Retry invitation email</button>':''):'')+'<details><summary>Guest names ('+guests.length+')</summary>'+guests.map(g=>'<p>'+esc(g.guest_name)+' · '+esc(g.guest_email)+' · '+(g.email_sent_at?'Email sent':'Email pending')+(!g.email_sent_at?'<button class="ghost" data-guest-retry="'+esc(g.id)+'">Retry email</button>':'')+'</p>').join('')+'</details></div>';}).join(''):empty('No allocations yet.');
 $('#guests-roster').querySelectorAll('[data-limit]').forEach(f=>f.onsubmit=e=>{e.preventDefault();guestAction(f,{action:'limit',quota:Number(f.elements.quota.value)});});
 $('#guests-roster').querySelectorAll('[data-revoke]').forEach(b=>b.onclick=()=>{if(confirm('Revoke artist access and release unused places? Issued tickets remain valid.'))guestAction(b,{action:'revoke'});});
 $('#guests-roster').querySelectorAll('[data-invite]').forEach(b=>b.onclick=()=>guestAction(b,{action:'invite'}));
 $('#guests-roster').querySelectorAll('[data-guest-retry]').forEach(b=>b.onclick=()=>guestAction(b,{action:'retry',entryId:b.dataset.guestRetry}));
 }catch(err){notice(err.message,true);}}
async function guestAction(el,body){const button=el.tagName==='BUTTON'?el:el.querySelector('button');button.disabled=true;try{const r=await api('/api/event-guest-list',{...body,eventId:$('#guests-event').value,allocationId:el.closest('[data-allocation]').dataset.allocation});await fetchGuestPage();notice(r.emailSent===false?'Saved. Email could not be sent; use Retry email.':'Guest list updated.');}catch(err){notice(err.message,true);button.disabled=false;}}
$('#guests-event').onchange=fetchGuestPage;
$('#guests-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;try{const r=await api('/api/event-guest-list',{action:'create',eventId:$('#guests-event').value,...Object.fromEntries(new FormData(f))});f.reset();await fetchGuestPage();notice(r.emailSent?'Allocation saved and invitation emailed.':'Allocation saved. Use Retry invitation email to send the invitation.');}catch(err){notice(err.message,true);}finally{b.disabled=false;}};
async function loadCapacityPage(){const list=safeEvents().filter(e=>isLive(e)&&!e.public_beta_test);const selected=new URLSearchParams(location.search).get('capacity')||$('#capacity-event').value;$('#capacity-event').innerHTML=options(list,selected);await fetchCapacityPage();}
async function fetchCapacityPage(){const id=$('#capacity-event').value;$('#capacity-form').hidden=!id;$('#capacity-quote').textContent='';if(!id){$('#capacity-summary').innerHTML=empty('Publish an event to manage capacity.');return;}try{const r=await api('/api/event-capacity?eventId='+id);const cap=r.tiers.reduce((n,t)=>n+t.quantity_total,0),used=r.inventory.reduce((n,t)=>n+Number(t.used_count),0);$('#capacity-summary').innerHTML='<h2>'+used+' / '+cap+' places allocated</h2><p>'+Math.max(0,cap-used)+' available · includes paid tickets, checkout holds and guest-list reservations.</p>'+(used>=cap*.8?'<p class="help-note"><strong>'+ (used>=cap?'Fully allocated.':'Approaching capacity.')+'</strong> Review an increase below.</p>':'');$('#capacity-tier').innerHTML=r.tiers.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+' · current '+t.quantity_total+'</option>').join('');$('#capacity-alerts').innerHTML='<h3>Capacity notifications</h3><p>Checked automatically every five minutes. Each threshold is notified once for this capacity.</p>'+r.alerts.map(a=>'<p>'+new Date(a.created_at).toLocaleString('en-GB')+' · '+a.threshold+'% threshold · '+a.used+' / '+a.capacity+'</p>').join('')+r.changes.map(c=>'<p>Increase to '+c.new_total+' places: '+esc(c.status==='needs_attention'?'Payment received — contact Customer Services for reconciliation':c.status)+' · '+esc(money(c.amount_cents,c.currency))+'</p>').join('');}catch(err){notice(err.message,true);}}
$('#capacity-event').onchange=fetchCapacityPage;
$('#capacity-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;try{const input={eventId:$('#capacity-event').value,tierId:f.elements.tierId.value,quantity:Number(f.elements.quantity.value)};const r=await api('/api/event-capacity',{...input,action:'quote'}),q=r.quote;$('#capacity-quote').innerHTML='<div class="help-note"><h3>'+q.oldTotal+' → '+q.newTotal+' total places</h3><p>'+esc(q.currentBand.replaceAll('_',' '))+' → '+esc(q.targetBand.replaceAll('_',' '))+'</p><p><strong>Extra listing fee: '+esc(money(q.amountCents,q.currency))+'</strong></p>'+(q.amountCents&&!r.paymentsEnabled?'<p>Paid capacity upgrades are not available yet. Your capacity is unchanged.</p>':'<button class="primary" id="capacity-confirm">'+(q.amountCents?'Continue to secure payment':'Confirm capacity increase')+' →</button>')+'</div>';const confirmButton=$('#capacity-confirm');if(confirmButton)confirmButton.onclick=async()=>{confirmButton.disabled=true;try{const d=await api('/api/event-capacity',{...input,action:'confirm',expectedAmount:q.amountCents});if(d.url){const url=new URL(d.url);if(url.origin!=='https://checkout.stripe.com')throw Error('Invalid payment link');location.assign(url.href);return;}await fetchCapacityPage();notice('Capacity increased.');}catch(err){notice(err.message,true);confirmButton.disabled=false;}};}catch(err){notice(err.message,true);}finally{b.disabled=false;}};

function renderOverview(){const offer=profile?.listingOffer,active=offer&&(!offer.valid_until||Date.parse(offer.valid_until)>Date.now())&&offer.listing_discount_percent>0;$('#listing-offer').hidden=!active;$('#listing-offer').textContent=active?(offer.listing_discount_percent===100?'Your account has free fixed-band listings.':offer.listing_discount_percent+'% account discount on fixed listing fees.')+' Applies to new quotes for events up to 2,000 tickets. Larger-event usage and payment processing stay separate.'+(offer.valid_until?' Valid until '+new Date(offer.valid_until).toLocaleString('en-GB')+'.':''):'';let visible=safeEvents();$('#greeting').textContent='Welcome, '+(profile?.display_name||'organiser')+'. Manage your events, ticket sales and door crew in one place.';$('#metric-events').textContent=visible.length;$('#metric-paid').textContent='—';$('#metric-scanned').textContent='—';$('#metric-money').textContent='—';let root=$('#overview-events');root.innerHTML=visible.length?visible.slice(0,4).map(drawEvent).join(''):empty('No events yet. Choose Create Event to build your first show.');wireRows(root);const published=visible.filter(e=>e.status==='published');if(published.length){fetchReport(published[0].id,true).then(()=>{}).catch(()=>{});}else{$('#metric-paid').textContent='0';$('#metric-scanned').textContent='0';$('#metric-money').textContent=money(0,profile.country_code==='GB'?'gbp':'eur');}}
function renderEvents(){const visible=safeEvents(),el=$('#all-events');el.innerHTML=visible.length?visible.map(drawEvent).join(''):empty('You have no new events. Start by creating your first event.');wireRows(el);}
async function refresh(){
 const d=await api('/api/organiser');profile=d.organiser;events=d.events||[];
 if(!profile){connectState=null;showOnboarding();return;}
 $('#sidebar-name').textContent=profile.display_name;$('#sidebar-country').textContent=profile.country_code==='GB'?'United Kingdom':'Portugal';
 const verification=loadStripeStatus();
 await loadBilling();loadCapacityNotifications();
 if((!profile.logo_url||!billingComplete)&&currentPage!=='hub'){showOnboarding();return;}
 $('#page-app').hidden=false;$('#loading').hidden=true;page(currentPage||'overview');
 // External payout verification updates the visible status without blocking the workspace.
 void verification;
}
function showOnboarding(){
 $('#page-app').hidden=false;$('#loading').hidden=true;$$('.page').forEach(x=>x.hidden=true);
 $('#onboarding').hidden=false;
 $('#register-form').hidden=!!profile;
 $('#onboarding-logo').hidden=!profile||!!profile.logo_url;
 $('#onboarding-billing').hidden=!profile||!profile.logo_url||billingComplete;
 $('#setup-profile-panel').hidden=!!profile?.logo_url;
 $('#sidebar-name').textContent=profile?.display_name||'New organiser';
 renderBillingForms();
}

$('#register-form').onsubmit=async e=>{
 e.preventDefault();const form=e.currentTarget,button=e.submitter||form.querySelector('button[type=submit]');
 if(button.disabled)return;button.disabled=true;$('#notice').hidden=true;
 try{
  const fields=new FormData(form);
  const result=await api('/api/organiser',{action:'register',displayName:String(fields.get('displayName')||'').trim(),country:fields.get('country'),acceptTerms:form.elements.acceptTerms.checked});
  if(!result.organiser?.id)throw Error('The service did not confirm your organiser profile. Please retry.');
  profile=result.organiser;billingRecord=null;billingComplete=false;connectState=null;
  showOnboarding();notice('Organiser profile saved. Next, upload your logo.',false,$('#initial-logo-save'));
  $('#initial-logo-file').focus();
 }catch(err){notice(err.message,true,button);}finally{button.disabled=false;}
};

const billFields=['entity_type','legal_name','contact_name','billing_email','phone','address_line_1','address_line_2','city','postal_code','vat_number'];
async function loadBilling(){
 if(!sb||!profile?.id){billingComplete=false;billingRecord=null;return;}
 const result=await sb.from('tb_organiser_billing').select('*').eq('organiser_profile_id',profile.id).maybeSingle();
 if(result.error)throw Error('Cannot load your billing details: '+result.error.message);
 billingRecord=result.data||null;billingComplete=!!result.data&&['legal_name','billing_email','address_line_1','city','postal_code'].every(key=>String(result.data[key]||'').trim());
 renderBillingForms();
}
function renderBillingForms(){
 for(const form of [$('#billing-form'),$('#billing-edit-form')]){
  if(!form)continue;
  if(form.id==='billing-edit-form'){
    const clone=$('#billing-form .form-grid').cloneNode(true);
    clone.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
    $('#billing-edit-fields').replaceChildren(clone);
  }
  for(const field of billFields){
   const el=form.elements.namedItem(field);
   if(!el)continue;
   el.value=(billingRecord?.[field]??(field==='billing_email'?session?.user?.email:field==='legal_name'?profile?.display_name:''))||'';
  }
 }
 renderConnectStatus();
}
function renderConnectStatus(){
 const s=connectState||{state:'checking'};
 let text={checking:'Checking your Stripe account…',not_started:'Your organiser account is saved. Verify your business and payout details here in TicketBunker using Stripe’s secure form.',action_required:'Action needed. Continue verification here to finish or update your details.',under_review:'Under review. Stripe is checking your submitted information. Check again later for the result.',verified:'Verified by Stripe for receiving transfers and bank payouts. Ticket sales and post-show payment release are activated separately.',restricted:'This Stripe connection needs support before it can receive payouts.',platform_blocked:'Your organiser details are saved. Verification is waiting for TicketBunker’s Stripe setup. You can continue preparing your events.',unavailable:'Live Stripe verification is temporarily unavailable. Your company details are saved.',error:'We could not check your Stripe verification. Please try Check verification status.'}[s.state]||'Check your Stripe verification status.';
 if(!profile)text='Create your organiser profile first.';
 else if(!profile.logo_url||!billingComplete)text='Save your organiser logo and Company & Billing details before starting Stripe verification.';
 $('#billing-review-help').hidden=!(s.ready&&!s.billingReviewComplete);
 if(s.ready)text=s.ticketSalesEnabled?'Your account checks are complete. Add your event and ticket types, then complete any listing fee to publish.':s.billingReviewComplete?'Stripe verification is complete. Live ticket payments are awaiting platform activation. You can prepare your event now.':'Stripe verification is complete. TicketBunker still needs to review your saved billing and tax details before paid events can be published. You can prepare your event now.';
 const help=$('[data-connect-help]');if(help)help.textContent=s.ready?'Your verification is saved. Use Update verification details if your business or bank information changes. Ticket payouts are released separately after the event, the report and payment checks.':'Stripe may ask for legal business details, a tax number, an identity document and a bank account. Complete the secure form here in TicketBunker. Stripe may open a window to verify your email or phone. No payment is taken during verification.';
 const label=s.state==='platform_blocked'?'Payout setup temporarily unavailable':s.ready?'Update verification details →':'Continue verification →';
 $$('[data-connect-status], [data-connect-summary]').forEach(el=>el.textContent=text);
 $$('[data-connect-setup]').forEach(el=>el.hidden=!!profile?.logo_url&&billingComplete);
 $$('[data-connect-start]').forEach(el=>{el.disabled=connectBusy||!profile?.logo_url||!billingComplete||s.canOnboard!==true;el.hidden=!!connectComponent;el.textContent=connectBusy?'Loading secure form…':label;});
 $$('[data-connect-refresh]').forEach(el=>el.disabled=connectBusy||!profile);
 const ownerSetup=s.state==='platform_blocked'&&s.setupUrl==='https://dashboard.stripe.com/connect';
 $$('[data-connect-admin]').forEach(el=>el.hidden=!ownerSetup);
 $$('[data-connect-error]').forEach(el=>el.hidden=s.state==='platform_blocked');
 if($('#stripe-account-status'))$('#stripe-account-status').textContent=text;
 $('#verification-banner').hidden=!profile||s.ticketSalesEnabled===true;
 $('#account-status').textContent=s.ticketSalesEnabled?'Ready to publish':s.ready?'Stripe verified':s.state==='under_review'?'Stripe reviewing':s.state==='platform_blocked'?'Verification unavailable':'Validation needed';
 $('#verification-banner-title').textContent=s.ready?(s.billingReviewComplete?'Ticket payment activation pending':'Billing review pending'):s.state==='platform_blocked'?'Stripe verification is not available yet':'Verify your business and payout details';
 if(currentDraft)renderListingPayment();
 $('#verification-banner-action').textContent=s.ready?'View account status →':s.state==='platform_blocked'?'View setup status →':'Validate your account →';
}
let stripeStatusPromise;
async function loadStripeStatus(){
 if(stripeStatusPromise)return stripeStatusPromise;
 stripeStatusPromise=readStripeStatus().finally(()=>{stripeStatusPromise=undefined;});
 return stripeStatusPromise;
}
async function readStripeStatus(){
 if(!profile){renderConnectStatus();return;}
 try{connectState=await api('/api/organiser-connect');$$('[data-connect-error]').forEach(el=>el.textContent=connectState.error||'');}
 catch(err){connectState=err.code==='platform_setup_required'?{...err.details,state:'platform_blocked',canOnboard:false}:{state:'error',canOnboard:false};$$('[data-connect-error]').forEach(el=>el.textContent=err.message);}
 renderConnectStatus();
}
async function startStripeOnboarding(){
 if(connectBusy)return;connectBusy=true;$('#notice').hidden=true;renderConnectStatus();$$('[data-connect-error]').forEach(el=>el.textContent='');
 try{
  const {mountStripeOnboarding}=await import('./embedded-onboarding.js');
  const shell=$('[data-connect-embedded]'),container=$('[data-connect-container]');
  shell.hidden=false;
  connectComponent=await mountStripeOnboarding({container,fetchSession:()=>api('/api/organiser-connect',{action:'embedded'}),
   onExit:async()=>{container.replaceChildren();connectComponent=null;shell.hidden=true;await loadStripeStatus();},
   onError:err=>{container.replaceChildren();connectComponent=null;shell.hidden=true;$$('[data-connect-error]').forEach(el=>el.textContent=err.message);renderConnectStatus();}
  });
  shell.scrollIntoView({behavior:'smooth',block:'start'});
 }catch(err){$('[data-connect-embedded]').hidden=true;if(err.code==='platform_setup_required'){connectState={...err.details,state:'platform_blocked',canOnboard:false};$('#notice').hidden=true;}else{$$('[data-connect-error]').forEach(el=>el.textContent=err.message);notice(err.message,true);}}
 finally{connectBusy=false;renderConnectStatus();}
}
$$('[data-connect-start]').forEach(el=>el.onclick=startStripeOnboarding);
$$('[data-connect-setup]').forEach(el=>el.onclick=showOnboarding);
window.addEventListener('ticketbunker:profile-saved',e=>{if(profile&&e.detail?.id===profile.id){profile={...profile,display_name:e.detail.display_name};$('#sidebar-name').textContent=profile.display_name;}});
$$('[data-connect-refresh]').forEach(el=>el.onclick=async()=>{el.disabled=true;await loadStripeStatus();});

async function saveBilling(event){
 event.preventDefault();
 if(!profile?.id||!session?.user?.id){notice('Sign in and create your organiser profile first.',true);return;}
 const form=event.target,btn=event.submitter||form.querySelector('button[type="submit"]');
 if(btn)btn.disabled=true;
 try{
  const values=Object.fromEntries(new FormData(form));
  const names=['legal_name','contact_name','billing_email','address_line_1','city','postal_code'];
  for(const key of names){if(String(values[key]||'').trim().length<(key==='address_line_1'?3:2))throw Error('Complete all required billing fields.');}
  const record={
   organiser_profile_id:profile.id,owner_user_id:session.user.id,country_code:profile.country_code,
   entity_type:values.entity_type,legal_name:String(values.legal_name||'').trim(),
   contact_name:String(values.contact_name||'').trim(),billing_email:String(values.billing_email||'').trim(),
   phone:String(values.phone||'').trim(),address_line_1:String(values.address_line_1||'').trim(),
   address_line_2:String(values.address_line_2||'').trim(),city:String(values.city||'').trim(),
   postal_code:String(values.postal_code||'').trim(),vat_number:String(values.vat_number||'').trim(),
   updated_at:new Date().toISOString()
  };
  const saved=await sb.from('tb_organiser_billing').upsert(record,{onConflict:'organiser_profile_id'}).select('organiser_profile_id').single();
  if(saved.error)throw Error('Unable to save billing details: '+saved.error.message);
  billingRecord=record;billingComplete=true;renderBillingForms();
  if(form.id==='billing-form')page('verification');
  else $('#billing-edit-status').textContent='Billing details updated successfully.';
  notice('Company and billing details saved. No registration or membership charge.',false,form.id==='billing-form'?$('[data-connect-start]'):btn);
 }catch(err){
  const node=form.id==='billing-form'?$('#billing-status'):$('#billing-edit-status');
  if(node)node.textContent=err.message;
  notice(err.message,true);
 }finally{if(btn)btn.disabled=false;}
}
$('#billing-form').addEventListener('submit',saveBilling);
$('#billing-edit-form').addEventListener('submit',saveBilling);

const checkedLogo=new Map();
async function inspectLogo(file,preview){
 if(!file)throw Error('Choose a transparent PNG logo.');
 if(file.type!=='image/png'&&!/\.png$/i.test(file.name))throw Error('PNG required — JPG, SVG and WebP are not accepted for the organiser logo.');
 if(file.size>2000000)throw Error('File too large. Compress the PNG to less than 2 MB.');
 if(file.size<100)throw Error('This image file is too small or invalid.');
 const uri=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read the selected PNG'));r.readAsDataURL(file)});
 const image=await new Promise((resolve,reject)=>{const el=new Image();el.onload=()=>resolve(el);el.onerror=()=>reject(Error('The selected file could not be decoded as a PNG'));el.src=uri});
 if(image.width<300||image.height<70)throw Error('Resolution too small: '+image.width+' × '+image.height+' px. Minimum 300 × 70 px; 600 px+ wide is recommended.');
 if(image.width>4096||image.height>4096)throw Error('Image too large in pixels ('+image.width+' × '+image.height+'). Maximum 4096 px in either direction.');
 const canvas=document.createElement('canvas'),scale=Math.min(1,600/Math.max(image.width,image.height));
 canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
 const ctx=canvas.getContext('2d',{willReadFrequently:true});
 if(!ctx)throw Error('Image checker unavailable on this browser. Please retry.');
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
 const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
 let transparent=0,visible=0,dark=0,neutral=0,total=pixels.length/4;
 for(let i=0;i<pixels.length;i+=4){
  const a=pixels[i+3],r=pixels[i],g=pixels[i+1],b=pixels[i+2];
  if(a<32)transparent++;
  if(a>=175){visible++;const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
   if(hi<=145){dark++;if(hi-lo<=45)neutral++;}
  }
 }
 const transparency=transparent/total,darkness=visible?dark/visible:0,neutrality=dark?neutral/dark:0;
 if(transparency<.02)throw Error('No clear transparency detected. Remove the solid background and export as a transparent PNG.');
 if(visible<25)throw Error('The logo is nearly invisible. Use visible black lettering or artwork.');
 if(darkness<.58||neutrality<.73)throw Error('The visible logo looks too light or colourful. Use black or dark neutral artwork so it prints clearly on white tickets.');
 preview.src=uri;preview.hidden=false;
 return {uri,width:image.width,height:image.height,kilobytes:Math.round(file.size/1024),transparent:true,black:true};
}
async function checkSelectedLogo(which){
 const input=$(which==='initial'?'#initial-logo-file':'#brand-file'),preview=$('#'+(which==='brand'?'brand-preview':'initial-logo-preview'));
 const save=$('#'+(which==='brand'?'brand-save':'initial-logo-save'));
 const status=$('#'+which+'-logo-status'),ready=$('#'+which+'-logo-ready');
 const hint=$('#'+(which==='brand'?'brand-preview-hint':'initial-preview-hint'));
 checkedLogo.delete(which);save.disabled=true;ready.textContent='Awaiting image check';
 if(!input.files?.length){status.dataset.state='idle';status.textContent='Choose a transparent PNG to check it automatically.';return}
 status.dataset.state='checking';status.textContent='Checking image format, dimensions, file size, transparency and contrast…';
 try {
  const file=input.files[0],result=await inspectLogo(file,preview);
  if(input.files[0]!==file)return;
  checkedLogo.set(which,{file,...result});
  status.dataset.state='valid';
  status.textContent='✓ PNG · '+result.width+' × '+result.height+' px · '+result.kilobytes+' KB · transparent background · black/dark lettering';
  ready.textContent='✓ Ready to upload';
  hint.hidden=true;save.disabled=false;
 }catch(e){
  preview.hidden=true;status.dataset.state='error';status.textContent='✕ '+e.message;
  ready.textContent='Choose a corrected image';save.disabled=true;
 }
}
async function uploadCheckedLogo(which){
 const checked=checkedLogo.get(which),input=$(which==='initial'?'#initial-logo-file':'#brand-file');
 if(!checked||input.files?.[0]!==checked.file)throw Error('Choose a logo and wait for the green checks before uploading.');
 const result=await api('/api/organiser-brand',{dataUrl:checked.uri});
 if(!result.logoUrl)throw Error('Logo was not saved. Please try again.');
 profile.logo_url=result.logoUrl;
 checkedLogo.delete(which);renderBranding();
 if(which==='initial')showOnboarding();
 notice('Your logo is saved.'+(billingComplete?' It will appear on your events and tickets.':' Next, save your company and billing details.'),false,which==='initial'?$('#save-billing'):$('#brand-save'));
 void loadStripeStatus();return result.logoUrl;
}
$('#initial-logo-file').addEventListener('change',()=>checkSelectedLogo('initial'));
$('#brand-file').addEventListener('change',()=>checkSelectedLogo('brand'));
$('#initial-logo-save').addEventListener('click',async()=>{
 const btn=$('#initial-logo-save');btn.disabled=true;
 try{await uploadCheckedLogo('initial')}catch(e){notice(e.message,true);btn.disabled=false;}
});
$('#brand-save').addEventListener('click',async()=>{
 const btn=$('#brand-save');btn.disabled=true;
 try{await uploadCheckedLogo('brand')}catch(e){notice(e.message,true);btn.disabled=false;}
});
function renderBranding(){if(profile?.logo_url){$('#brand-preview').src=profile.logo_url;$('#brand-preview').hidden=false;$('#brand-preview-hint').hidden=true;}$('#event-brand-preview').src=profile?.logo_url||'/brand-icon.png';}
$('#event-poster').onchange=e=>{const file=e.target.files[0];if(!file)return;if(file.size>2000000||!['image/png','image/jpeg','image/webp'].includes(file.type)){notice('Poster must be PNG, JPG or WebP under 2 MB.',true,$('#event-poster'));e.target.value='';return;}const reader=new FileReader();reader.onload=()=>{$('#poster-preview').src=reader.result;$('#poster-preview').hidden=false;};reader.readAsDataURL(file);};
const standardTicketTypes=['General Admission','VIP','Concessions','60+','Kids'];
function ticketRow(name=''){
 return '<div class="tier-row"><label>Ticket name<input name="name" maxlength="100" minlength="2" value="'+esc(name)+'"></label><label>Price including applicable IVA <em class="currency-symbol">'+(profile?.country_code==='GB'?'£':'€')+'</em><input name="price" type="number" min="1" max="100000" step=".01" placeholder="Price"></label><label>Quantity<input name="capacity" type="number" min="1" max="2000" value="100"></label><button aria-label="Remove '+esc(name||'ticket type')+'" class="remove-tier" type="button">×</button></div>';
}
function resetTicketRows(){
 const saved=new Set((currentDraft?.tiers||[]).map(t=>t.name.trim().toLocaleLowerCase()));
 const names=standardTicketTypes.filter(name=>!saved.has(name.toLocaleLowerCase()));
 $('#tier-rows').innerHTML=(names.length?names:['']).map(ticketRow).join('');
}
function pricedTicketRows(rows){
 const priced=rows.filter(row=>String(row.price??'').trim()!=='');
 if(!priced.length)throw Error('Enter a price for at least one ticket type. Leave unused prices blank.');
 const seen=new Set();
 return priced.map(row=>{
  const name=String(row.name||'').trim(),price=Number(row.price),capacity=Number(row.capacity),priceCents=Math.round(price*100);
  if(name.length<2||name.length>100)throw Error('Each priced ticket needs a name of 2–100 characters.');
  if(!Number.isFinite(price)||priceCents<100||priceCents>10000000||Math.abs(price*100-priceCents)>0.000001)throw Error(name+': enter a price from 1.00 to 100,000.00 with up to two decimal places.');
  if(!Number.isInteger(capacity)||capacity<1||capacity>2000)throw Error(name+': enter a whole ticket quantity from 1 to 2,000.');
  const key=name.toLocaleLowerCase();if(seen.has(key))throw Error('Each priced ticket type needs a different name.');seen.add(key);
  return {name,priceCents,capacity};
 });
}
function startNewEvent(){clearEventError();savedEventInput=null;posterUploaded=false;$('#save-event').textContent='Save event draft →';$('#saved-ticket-types').hidden=true;$('#ticket-next-actions').hidden=true;$('#tier-form').hidden=false;currentDraft=null;$('#event-form').reset();$('#poster-preview').hidden=true;$('#tier-form').reset();resetTicketRows();nextStep(1);}
function renderSavedTicketTypes(){
 const saved=currentDraft?.tiers||[],summary=$('#saved-ticket-types');summary.hidden=!saved.length;
 summary.innerHTML=saved.length?'<h3>Your saved ticket types</h3>'+saved.map(t=>'<p><strong>'+esc(t.name)+'</strong> · '+esc(money(t.price_cents,currentDraft.currency))+' · '+Number(t.quantity_total)+' tickets</p>').join(''):'';
 $('#ticket-next-actions').hidden=!saved.length;$('#tier-form').hidden=!!saved.length;
}
function openDraftTickets(event){
 if(!event)return;
 currentDraft=event;page('create');$('#notice').hidden=true;$('#tier-form').reset();resetTicketRows();
 renderSavedTicketTypes();
 $('#tier-event-name').textContent=event.title;$$('.currency-symbol').forEach(el=>el.textContent=event.currency==='gbp'?'£':'€');nextStep(2);
}
$('#add-more-tickets').onclick=()=>{
 $('#tier-form').reset();resetTicketRows();
 $('#tier-form').hidden=false;$('#notice').hidden=true;
 $('#tier-rows [name=name]').focus();
};
$('#review-tickets').onclick=()=>openDraftTickets(currentDraft);

function nextStep(n){[1,2,3].forEach(i=>{$('#event-step-'+i).hidden=i!==n;$$('.step')[i-1].classList.toggle('active',i===n)});$('#page-create').scrollIntoView({behavior:'smooth',block:'start'});}
function fileData(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('Could not read uploaded image'));r.readAsDataURL(file)});}
$('#event-form').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter||$('#save-event');button.disabled=true;clearEventError();
 try{
  const f=new FormData(e.target),poster=$('#event-poster').files[0];
  const data={action:'event',title:f.get('title'),kind:f.get('kind'),venue:f.get('venue'),venueCity:f.get('venueCity'),headlineArtist:f.get('headlineArtist'),startsAt:f.get('startsAt'),endsAt:f.get('endsAt'),description:f.get('description')};
  if(!data.endsAt||Date.parse(data.endsAt)<=Date.parse(data.startsAt))throw Object.assign(Error('Set a finish time after the start time.'),{details:{field:'endsAt'}});
  if(poster&&(poster.size>2000000||!['image/png','image/jpeg','image/webp'].includes(poster.type)))throw Error('Poster must be PNG, JPG or WebP under 2 MB.');
  const input=JSON.stringify(data);
  if(savedEventInput&&input!==savedEventInput)throw Error('Your draft is already saved. Finish uploading its poster first, or start a new event from Create Event.');
  if(!savedEventInput){
   const result=await api('/api/organiser',data);
   if(!result.event?.id)throw Error('The service did not confirm the save. Check My Events before retrying.');
   currentDraft={...data,...result.event,status:'draft',tiers:[],currency:profile.country_code==='GB'?'gbp':'eur',event_logo_url:profile.logo_url};
   savedEventInput=input;posterUploaded=false;
  }
  if(poster&&!posterUploaded){
   try{const upload=await api('/api/event-media',{eventId:currentDraft.id,kind:'poster',dataUrl:await fileData(poster)});currentDraft.image_url=upload.url;posterUploaded=true;}
   catch(err){button.textContent='Retry poster upload →';throw Error('Your event draft is saved, but its poster could not upload. '+err.message+' Use Retry poster upload to continue with the same draft.');}
  }
  $('#tier-event-name').textContent=currentDraft.title;$$('.currency-symbol').forEach(x=>x.textContent=profile.country_code==='GB'?'£':'€');
  nextStep(2);notice('Event draft and poster saved. Now choose your ticket types.',false,$('#tier-form button[type=submit]'));
  try{await reloadEvents()}catch{notice('Your event draft and poster are saved. The event list could not refresh; you can continue with ticket options.',true,$('#tier-form button[type=submit]'));}
 }catch(err){eventError(err)}finally{button.disabled=false;}
};
function addTierRow(){const box=document.createElement('div');box.innerHTML=ticketRow();$('#tier-rows').append(box.firstElementChild);$('#tier-rows .tier-row:last-child [name=name]').focus();}
$('#add-tier').onclick=()=>{if($$('#tier-rows .tier-row').length>=10)return notice('Maximum ten types per batch.',true);addTierRow()};
$('#tier-rows').onclick=e=>{const button=e.target.closest('.remove-tier');if(!button)return;button.closest('.tier-row').remove();if(!$('#tier-rows .tier-row'))addTierRow();};
$('#tier-form').onsubmit=async e=>{
 e.preventDefault();const btn=e.submitter||$('#tier-form button[type=submit]');btn.disabled=true;$('#notice').hidden=true;
 try{
  if(!currentDraft?.id)throw Error('Save event details first.');
  const list=pricedTicketRows($$('#tier-rows .tier-row').map(row=>({name:row.querySelector('[name=name]').value,price:row.querySelector('[name=price]').value,capacity:row.querySelector('[name=capacity]').value})));
  const r=await api('/api/organiser',{action:'tiers',eventId:currentDraft.id,tiers:list});
  const merged=new Map((currentDraft.tiers||[]).map(t=>[t.id,t]));(r.tiers||[]).forEach(t=>merged.set(t.id,t));currentDraft.tiers=[...merged.values()];
  renderSavedTicketTypes();drawReview();nextStep(3);
  notice('Ticket options saved. Review your event below.',false,$('#request-review'));
  try{await reloadEvents();if(!$('#event-step-3').hidden)drawReview();}catch{notice('Your ticket types are saved. The event list could not refresh; you can continue reviewing this draft.',true,$('#request-review'));}
 }catch(err){notice(err.message,true,btn)}finally{btn.disabled=false;}
};
$('#skip-tier').onclick=()=>{$('#notice').hidden=true;drawReview();nextStep(3);$('#event-step-3 h2').tabIndex=-1;$('#event-step-3 h2').focus({preventScroll:true});};

function drawReview(){if(!currentDraft)return;$('#review-summary').innerHTML='<div class="event-row">'+(currentDraft.image_url?'<img class="thumb" src="'+esc(currentDraft.image_url)+'" alt="Event poster">':'')+'<div class="event-detail"><h3>'+esc(currentDraft.title)+'</h3><p>'+esc(currentDraft.venue)+'</p><p>'+esc((currentDraft.tiers||[]).length)+' ticket types saved</p></div></div>';$('#review-message').textContent='Your event draft has been saved. You can add more ticket types or publish directly once payment setup is ready.';renderListingPayment();}

function renderListingPayment(){
 const capacity=(currentDraft?.tiers||[]).reduce((s,t)=>s+t.quantity_total,0),paid=currentDraft?.fees?.some(f=>f.status==='paid'),offer=profile?.listingOffer,free=offer?.listing_discount_percent===100&&(!offer.valid_until||Date.parse(offer.valid_until)>Date.now()),waived=free||currentDraft?.charity?.status==='verified';
 const band=capacity<=100?['starter',9900]:capacity<=500?['standard',19900]:capacity<=1000?['headline',29900]:['event_plus',39900];
 const rate=offer&&(!offer.valid_until||Date.parse(offer.valid_until)>Date.now())?Number(offer.listing_discount_percent||0):0,amount=band[1]-Math.round(band[1]*rate/100),button=$('#pay-listing');
 button.hidden=paid||waived||!capacity;button.dataset.plan=band[0];button.disabled=connectState?.ticketSalesEnabled!==true;
 button.textContent='Pay '+money(amount,currentDraft?.currency||'eur')+' event listing →';
 const accountReady=connectState?.ticketSalesEnabled===true;
 $('#request-review').disabled=!capacity||capacity>2000||!accountReady||!(paid||waived);
 $('#review-message').textContent=!capacity?'Add a priced ticket type to continue.':capacity>2000?'Events above 2,000 tickets need an agreed larger-event plan. Contact Customer Services.':!accountReady?(connectState?.ready?(connectState.billingReviewComplete?'Your draft is saved. Ticket payments are waiting for platform activation.':'Your draft is saved. Complete the billing and tax review in Account Validation to publish.'):'Your draft is saved. Complete Account Validation to publish.'):!(paid||waived)?'Your draft is saved. Complete the listing payment below, then publish your event.':'Your draft is ready. Choose Publish event to make tickets available.';
 $('#listing-payment-review').textContent=paid?'Your event listing payment is confirmed.':waived?'Your fixed-band listing fee is waived. Payment and tax verification still apply.':!capacity?'Add ticket types to calculate your event listing fee.':button.disabled?'Complete Stripe verification and billing/tax confirmation before paying the listing fee.':'Listing fee: '+money(amount,currentDraft?.currency||'eur')+' including applicable VAT / IVA. Payment processing remains separate. No added buyer booking fee.';
}
$('#pay-listing').onclick=async()=>{const button=$('#pay-listing');button.disabled=true;try{const r=await api('/api/organiser-listing',{eventId:currentDraft.id,plan:button.dataset.plan});if(r.waived){notice(r.message);await reloadEvents();drawReview();return;}const target=new URL(r.url);if(target.origin!=='https://checkout.stripe.com')throw Error('Invalid payment link');location.assign(target.href);}catch(error){notice(error.message,true);button.disabled=false;}};

$('#request-review').onclick=async()=>{
 const btn=$('#request-review');btn.disabled=true;
 try{
  if(!currentDraft?.id)throw Error('Save an event first.');
  const r=await api('/api/organiser',{action:'publish',eventId:currentDraft.id});
  currentDraft.status='published';events=events.map(ev=>ev.id===currentDraft.id?{...ev,status:'published'}:ev);
  page('events');notice(r.message||'Event published successfully.',false,$('#all-events'));
  try{await reloadEvents();if(currentPage==='events')renderEvents();}catch{notice('Your event is published. The event list could not refresh; reopen My Events to update it.',true,$('#all-events'));}
 }catch(err){notice(err.message,true,btn)}finally{if(currentDraft?.status!=='published')renderListingPayment();}
};

async function reloadEvents(){const r=await api('/api/organiser');events=r.events||[];profile=r.organiser||profile;const item=events.find(e=>e.id===currentDraft?.id);if(item)currentDraft=item;return r;}
async function fetchReport(id,overview=false){if(!id)return;try{const {report}=await api('/api/event-organiser-report?eventId='+encodeURIComponent(id));reportCache[id]=report;if(overview){const reports=await Promise.allSettled(safeEvents().filter(ev=>ev.status==='published').slice(0,50).map(ev=>reportCache[ev.id]?Promise.resolve(reportCache[ev.id]):api('/api/event-organiser-report?eventId='+encodeURIComponent(ev.id)).then(z=>z.report)));let paid=0,checked=0,revenue=0;reports.forEach(z=>{if(z.status==='fulfilled'){paid+=z.value.paidTickets||0;checked+=z.value.paidCheckedIn||0;revenue+=z.value.revenueCents||0;}});$('#metric-paid').textContent=paid;$('#metric-scanned').textContent=checked;$('#metric-money').textContent=money(revenue,profile.country_code==='GB'?'gbp':'eur');return;}
if($('#report-event').value!==id)return;latestReport=report;renderReport(report);
}catch(err){if(!overview&&$('#report-event').value===id)$('#report-body').innerHTML='<p>'+esc(err.message)+'</p>';}}
function renderReport(r){if(!r)return;$('#report-body').innerHTML=(r.exceptionalCheckedIn?'<p class="preview-note">'+Number(r.exceptionalCheckedIn)+' ticket entries were recorded against orders that are now cancelled or refunded. Review these separately from paid attendance.</p>':'')+(r.attendancePending?'<p class="preview-note" role="status"><strong>Awaiting offline scanner sync.</strong> These are confirmed uploaded check-ins. Final attendance and no-show totals will update after the hubs and offline scanners finish syncing.</p>':'')+'<div class="report-brand">'+(r.organiserLogo?'<img src="'+esc(r.organiserLogo)+'" alt="Organiser logo">':'')+'<div><strong>'+esc(r.title)+'</strong><br><span>'+esc(r.organiserName||profile.display_name)+' · Powered by TicketBunker</span></div><img src="/brand-icon.png" alt="TicketBunker" style="width:45px;height:45px;margin-left:auto"></div><div class="report-stats"><div class="metric"><span>PAID TICKETS</span><strong>'+Number(r.paidTickets||0)+'</strong></div><div class="metric"><span>GROSS REVENUE</span><strong>'+esc(money(r.revenueCents,r.currency))+'</strong></div><div class="metric"><span>DOOR CHECK-INS</span><strong>'+Number(r.paidCheckedIn||0)+'</strong></div><div class="metric"><span>'+esc(r.attendancePending?'AWAITING SCANNER SYNC':r.eventFinished?'NO-SHOWS':'NOT YET SCANNED')+'</span><strong>'+(r.attendancePending?'Pending':Number(r.paidNotCheckedIn||0))+'</strong></div></div><p><strong>Guest passes: '+Number(r.guestTickets||0)+' issued · '+Number(r.guestCheckedIn||0)+' scanned</strong></p><h3>Scanner crew activity</h3>'+(r.scannedByStaff?.length?'<table class="report-table"><thead><tr><th>Staff member</th><th>Paid scans</th></tr></thead><tbody>'+r.scannedByStaff.map(x=>'<tr><td>'+esc(x.name)+'</td><td>'+Number(x.paid||0)+'</td></tr>').join('')+'</tbody></table>':empty('No scanner activity yet.'))+'<p class="preview-note">Paid ticket sales are counted independently of scans. Processing fees and payouts are reconciled separately.</p>';}
function loadReportPage(){const list=safeEvents(),s=$('#report-event');s.innerHTML='<option value="">Select an event</option>'+options(list,s.value);if(s.value)fetchReport(s.value);else $('#report-body').innerHTML=empty('Select an event to see verified reporting data.');window.dispatchEvent(new Event('ticketbunker:reports'));}
$('#report-event').onchange=e=>{latestReport=null;$('#report-body').innerHTML=empty(e.target.value?'Loading event report…':'Select an event to see verified reporting data.');if(e.target.value)fetchReport(e.target.value);};$('#refresh-report').onclick=()=>fetchReport($('#report-event').value);
function loadStaffPage(){const list=safeEvents().filter(isLive);$('#staff-event').innerHTML='<option value="">Choose a published event</option>'+options(list);$('#staff-form').hidden=!list.length;$('#staff-list').innerHTML=list.length?empty('Choose a published event to manage scanner invitations.'):empty('Publish an event first. Scanner crew invitations appear only after the event is live.');}
$('#staff-event').onchange=async()=>{const id=$('#staff-event').value;if(!id)return;try{const d=await api('/api/event-staff?eventId='+encodeURIComponent(id));$('#staff-list').innerHTML=(d.staff||[]).filter(x=>!x.revoked_at).map(x=>'<div class="roster-line">'+esc(x.email||x.user_id)+' · Active <button class="ghost" data-revoke-user="'+esc(x.user_id)+'">Revoke access</button></div>').join('')+(d.invites||[]).filter(x=>!x.revoked_at&&!x.accepted_at).map(x=>'<div class="roster-line">'+esc(x.invited_email)+' · Invitation pending <button class="ghost" data-revoke-invite="'+esc(x.id)+'">Revoke invitation</button></div>').join('')||empty('No active scanner crew or invitations.');}catch(err){notice(err.message,true)}};
$('#staff-list').onclick=async e=>{const b=e.target.closest('[data-revoke-user],[data-revoke-invite]');if(!b)return;b.disabled=true;try{await api('/api/event-staff',{action:b.dataset.revokeUser?'revokeStaff':'revokeInvite',eventId:$('#staff-event').value,userId:b.dataset.revokeUser,inviteId:b.dataset.revokeInvite});await $('#staff-event').onchange();notice('Access revoked.');}catch(err){notice(err.message,true);b.disabled=false;}};

$('#staff-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const id=$('#staff-event').value;if(!id)throw Error('Choose a live event first');const x=await api('/api/event-staff',{action:'invite',eventId:id,email:new FormData(e.target).get('email')});notice(x.emailSent?'Scanner invitation emailed.':'Invitation created. Email could not be delivered — copy the invitation link from the result.');if(x.invitationUrl)$('#staff-list').innerHTML='<div class="help-note">Private invitation URL: <a href="'+esc(x.invitationUrl)+'" target="_blank" rel="noopener">'+esc(x.invitationUrl)+'</a></div>';e.target.reset();}catch(err){notice(err.message,true)}finally{b.disabled=false;}};
function loadStreetPage(){let arr=safeEvents(),s=$('#street-event');s.innerHTML='<option value="">Choose an event</option>'+options(arr);$('#street-form').hidden=!arr.length;$('#street-list').innerHTML=arr.length?empty('Select an event to manage promoters and their rewards.'):empty('Create an event first.');}
$('#street-event').onchange=async()=>{let id=$('#street-event').value;if(!id)return;try{let r=await api('/api/event-street-team?eventId='+encodeURIComponent(id));$('#street-list').innerHTML=r.team?.length?r.team.map(p=>'<div class="roster-line"><b>'+esc(p.name)+'</b> — '+Number(p.paidTickets||0)+' paid ticket sales <br><a href="'+esc(p.link)+'" target="_blank" rel="noopener">'+esc(p.link)+'</a></div>').join(''):empty('No street-team members yet.');}catch(err){notice(err.message,true)}};
$('#street-form').onsubmit=async e=>{e.preventDefault();const btn=e.submitter;btn.disabled=true;try{const id=$('#street-event').value;if(!id)throw Error('Choose an event first.');const f=new FormData(e.target),r=await api('/api/event-street-team',{action:'create',eventId:id,name:f.get('name'),email:f.get('email'),rewardType:f.get('rewardType'),rewardGoal:Number(f.get('rewardGoal')),rewardDescription:f.get('rewardDescription'),rewardValueCents:Math.round(Number(f.get('rewardValue')||0)*100)});notice('Promoter link created: '+r.link);$('#street-event').dispatchEvent(new Event('change'));e.target.reset();}catch(err){notice(err.message,true)}finally{btn.disabled=false;}};
$('#sign-out').onclick=async()=>{try{await sb.auth.signOut();location.replace('/login.html?next=%2Forganiser.html')}catch(err){notice(err.message,true)}};
window.addEventListener('hashchange',()=>{const target={'#featured-placement':'promotions','#business-details':'profile','#verification':'verification'}[location.hash];if(target&&profile)page(target);});
async function boot(){try{const r=await fetch('/api/supabase-config',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Shared login service is unavailable');const cfg=await r.json();if(!window.supabase)throw Error('Authentication library failed to load');sb=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true}});let auth=await sb.auth.getSession();session=auth.data?.session;if(!session){location.replace('/login?role=organiser&next='+encodeURIComponent(location.pathname+location.search+location.hash));return;}const verified=await sb.auth.getUser();if(verified.error||!verified.data.user)throw Error('Please sign in again.');token=session.access_token;window.ticketbunkerAuth=sb;window.ticketbunkerRefresh=refresh;sb.auth.onAuthStateChange((event,s)=>{if(event==='TOKEN_REFRESHED')token=s.access_token;if(event==='SIGNED_OUT')location.replace('/login?role=organiser');});if(!verified.data.user.email_confirmed_at)throw Error('Please confirm your account email before opening the Organiser Portal.');await refresh();window.dispatchEvent(new Event('ticketbunker:ready'));const paidEvent=new URLSearchParams(location.search).get('event');if(paidEvent&&new URLSearchParams(location.search).has('listing')){currentDraft=events.find(e=>e.id===paidEvent)||null;if(currentDraft){page('create');drawReview();nextStep(3);}}if(['#featured-placement','#promotions'].includes(location.hash))page('promotions');if(location.hash==='#business-details')page('profile');if(location.hash==='#verification')page('verification');const onboarding=new URLSearchParams(location.search).get('onboarding');if(onboarding){history.replaceState(null,'','/organiser#verification');page('verification');await loadStripeStatus();if(onboarding==='refresh'&&connectState?.canOnboard)await startStripeOnboarding();else if(onboarding==='returned')notice(connectState?.ready?'Stripe has confirmed your account verification.':'You have returned from Stripe. Check the current verification status below.');}}catch(err){$('#loading').classList.add('error');$('#loading-text').textContent=err.message;const a=document.createElement('a');a.href='/login?role=organiser';a.textContent='Return to sign-in →';a.style.color='#00e0a6';$('#loading').append(a);}}

async function loadHubPage(){
 const select=$('#hub-event'),list=safeEvents().filter(isLive);select.innerHTML=list.length?options(list,select.value):'<option value="">No active events</option>';
 const update=()=>{$('#hub-open').href='ticketbunkerhub://open'+(select.value?'?event='+encodeURIComponent(select.value):'');};select.onchange=update;update();
 const container=$('#hub-downloads');container.textContent='Checking desktop app availability…';
 try{
  const response=await fetch('/api/hub-release');if(!response.ok)throw Error();const release=await response.json();container.replaceChildren();
  if(!release.available){container.textContent='Public installers are being prepared. For organiser testing, use the App Downloads section above.';return;}
  for(const item of release.downloads){const url=new URL(item.url);if(url.protocol!=='https:'||url.hostname!=='github.com'||!url.pathname.startsWith('/Soundbunkeralgarve/soundbunker-website/releases/download/ticketbunker-hub-v'))continue;const a=document.createElement('a');a.className='ghost';a.href=url.href;a.textContent=item.label;a.rel='noopener';container.append(a,document.createTextNode(' '));}
 }catch{container.textContent='App downloads are temporarily unavailable. Please check again while connected to the internet.';}
}

boot();
})();
