import {$,api,authClient,escapeHtml as esc,date,safeUrl,safeNext,money} from './shared.js';
import {preferenceFields,readPreferences} from './promo-options.js';
import {PARTNER_SUPPLIERS} from './partner-booking-suppliers.js';
import {renderPartnerBooking,externalBookingUrl,confirmationBase64,validateConfirmationFile,createAccountScope} from './account-partner-bookings.js';
preferenceFields(document.querySelector('#weekly-fields'));
const params=new URLSearchParams(location.search);
const oldRole=location.hash==='#organisers'?'organiser':'';
const next=safeNext(params.get('next'));
const role=params.get('role')==='organiser'||oldRole||next.startsWith('/organiser')?'organiser':'buyer';
const accountScope=createAccountScope();
let mode='login',sb,session,tickets=[],partnerBookings=[],change=null,busy=false,bookingFilter='all',partnerEditing=null,partnerRequestId=null;
const adminMode=next==='/control-room'||next.split('?')[0]==='/support-admin';
const returnTo=next||(role==='organiser'?'/organiser':'/my-tickets');
const loginPath='/login?role='+role+(next?'&next='+encodeURIComponent(next):'');
function message(text,bad=false){$('#auth-message').textContent=text;$('#auth-message').classList.toggle('error',bad);}
function setMode(value){
 mode=value;const signup=mode==='signup',reset=mode==='reset',recover=mode==='recover';
 $('#name-field').hidden=!signup;$('#full-name').required=signup;
 $('#signup-options').hidden=!signup;$('#accept-terms').required=signup;
 $('#password-field').hidden=reset;$('#password').required=!reset;
 $('#password').autocomplete=signup||recover?'new-password':'current-password';
 $('#email').closest('label').hidden=recover;$('#email').required=!recover;
 $('#auth-submit').textContent=signup?'Create account →':reset?'Send reset link →':recover?'Save new password →':'Sign in →';
 $('#form-heading').textContent=signup?(role==='organiser'?'Create your organiser login.':'Create your buyer account.'):reset?'Reset your password.':recover?'Choose a new password.':'Welcome back.';
 $('#login-tab').setAttribute('aria-pressed',String(!signup));$('#signup-tab').setAttribute('aria-pressed',String(signup));
 $('#forgot').hidden=reset||recover;message('');
}
$('#buyer-role').setAttribute('aria-current',role==='buyer'?'page':'false');
$('#organiser-role').setAttribute('aria-current',role==='organiser'?'page':'false');
$('#account-label').textContent=role==='organiser'?'Organiser account':'Buyer account';
if(role==='organiser'){
 $('#auth-heading').innerHTML='Your next<br>great event<br><em>starts here.</em>';
 document.querySelector('.auth-story .eyebrow').textContent='SELL TICKETS · ORGANISER ACCOUNT';
 document.querySelector('.trust span').textContent='Clear event pricing';
 $('#account-purpose').textContent='Selling tickets? Your organiser portal contains event setup, sales, door staff, reports and payouts.';
 $('#auth-description').textContent='Create events, add your branding and manage tickets, promoters and door staff from one account.';
 document.title='Organiser sign-in | TicketBunker';
}
if(adminMode){$('#account-label').textContent='Owner admin';$('#auth-heading').innerHTML='Your TicketBunker.<br>Your control room.';$('#auth-description').textContent='Sign in with your authorised owner email to manage organisers, offers and email promotions.';document.title='Admin sign-in | TicketBunker';$('#signup-tab').hidden=true;}
function showAuth(){accountScope.clear();session=null;tickets=[];partnerBookings=[];$('#ticket-list').replaceChildren();$('#partner-booking-list').replaceChildren();$('#account-email').textContent='';$('#account').hidden=true;$('#auth').hidden=false;$('#boot-status').hidden=true;$('#partner-booking-dialog').close();$('#ticket-dialog').close();$('#partner-booking-form').reset();$('#postponed-bookings').replaceChildren();$('#postponed-bookings').hidden=true;$('#cancellation-bookings').replaceChildren();$('#cancellation-bookings').hidden=true;$('#vip-pill').hidden=true;change=null;partnerEditing=null;updateBookingFilters();}
async function enter(s){
 if(busy)return;
 const entering=accountScope.snapshot();
 const user=await sb.auth.getUser();
 if(!accountScope.isCurrent(entering))return;
 if(user.error||!user.data.user){showAuth();message('Please sign in again.',true);return;}
 if(user.data.user.id!==s.user?.id){showAuth();message('Your account changed. Please sign in again.',true);return;}
 if(!user.data.user.email_confirmed_at){showAuth();message('Confirm your email address using the email we sent before signing in.',true);return;}
 accountScope.begin(user.data.user.id);const account=accountScope.snapshot();session=s;
 if(user.data.user.user_metadata?.ticketbunker_marketing_signup_pending===true){await api('client-marketing-consent',{source:'signup'},s.access_token).catch(()=>{});}
 if(!accountScope.isCurrent(account))return;
 if(returnTo!=='/my-tickets'){location.replace(returnTo);return;}
 $('#boot-status').hidden=true;$('#auth').hidden=true;$('#account').hidden=false;
 $('#account-email').textContent=user.data.user.email;
 document.title='My tickets & bookings | TicketBunker';
 await Promise.allSettled([loadTickets(),loadPartnerBookings(),loadPreferences(),loadWeekly(),loadCancellationRefunds(),loadPostponements(),loadVip()]);
}
// VIP badge next to your email when your membership is running.
async function loadVip(){const account=accountScope.snapshot();const vip=await api('ticketbunker-vip',null,await currentToken());if(accountScope.isCurrent(account))$('#vip-pill').hidden=!vip.member;}
async function currentToken(){const account=accountScope.snapshot();const {data,error}=await sb.auth.getSession();if(!accountScope.isCurrent(account))throw Error('Your account changed. Please try again.');if(error||!data.session){showAuth();throw Error('Your session expired. Please sign in.');}if(session&&session.user.id!==data.session.user.id){showAuth();throw Error('Your account changed. Please sign in again.');}session=data.session;return session.access_token;}
async function loadTickets(){
 const account=accountScope.snapshot();
 $('#tickets-status').textContent='Loading TB tickets…';
 try{
  const response=await api('my-event-tickets',null,await currentToken());if(!accountScope.isCurrent(account))return;tickets=response.tickets||[];
  $('#ticket-list').innerHTML=tickets.length?tickets.map(t=>`<article class="ticket-card">${t.poster&&safeUrl(t.poster)?`<img class="poster" src="${esc(safeUrl(t.poster))}" alt="${esc(t.title)} poster" loading="lazy">`:'<div class="poster poster-placeholder" aria-hidden="true">TB</div>'}<div><div class="booking-badges"><span class="booking-kind tb-kind">TB ticket</span><span class="status-tag">${t.used?'CHECKED IN':Date.parse(t.startsAt)<Date.now()?'PAST EVENT':'YOUR ADMISSION'}</span></div><h2>${esc(t.title)}</h2><p class="booking-supplier">Issued by <strong>The Ticket Bunker</strong></p><p>${esc(date(t.startsAt,t.timezone))}</p><p>${esc(t.venue)}</p><p><strong>${esc(t.ticketName)}</strong> · ${esc(t.holderName)}</p></div><div class="ticket-actions"><a class="primary" href="${esc(safeUrl(t.url))}">View ticket ↗</a>${t.canManage?`<button class="secondary" data-change="name" data-ticket="${esc(t.id)}">Change name</button><button class="secondary" data-change="transfer" data-ticket="${esc(t.id)}">Transfer ticket</button>`:''}<button class="text-button" data-change="refund" data-ticket="${esc(t.id)}">Request a refund</button></div></article>`).join(''):'<div class="empty-state"><span class="eyebrow">YOUR NEXT NIGHT STARTS HERE</span><h2>No TB tickets yet.</h2><p>Tickets bought directly through The Ticket Bunker with your verified email appear here.</p><a class="primary" href="/#discover">Explore events ↗</a></div>';
  updateBookingFilters();$('#tickets-status').textContent='';
 }catch(e){if(accountScope.isCurrent(account))$('#tickets-status').textContent='TB tickets could not load. '+e.message;}
}
async function loadPostponements(){
 const account=accountScope.snapshot();
 const target=$('#postponed-bookings');
 try{
  const r=await api('event-postponement',null,await currentToken());if(!accountScope.isCurrent(account))return;target.hidden=!r.choices?.length;
  target.innerHTML=r.choices?.length?'<h2>Postponed & rescheduled bookings</h2>'+r.choices.map(x=>{const p=x.tb_event_postponements,newDate=p.new_starts_at?date(p.new_starts_at,x.sb_events.venue_timezone):'New date being arranged',state=x.choice==='refund'?'Full refund selected. Your tickets cannot be used.':x.choice==='rollover'?'Booking kept. Your original ticket and QR remain linked to the reposted event.':'Choose what to do with this booking. Admission is paused until you keep it.';return '<article class="ticket-card"><div><h3>'+esc(x.sb_events.title)+'</h3><p>'+esc(newDate)+'</p><p>'+esc(state)+'</p><p>'+esc(money(x.sb_event_orders.total_cents,x.sb_event_orders.currency))+' · choice applies to all tickets in this booking.</p>'+(x.canChoose&&x.choice!=='refund'?'<div class="button-row"><button class="secondary" data-postponement="'+esc(x.postponement_id)+'" data-order="'+esc(x.order_id)+'" data-choice="rollover">Keep booking / roll over</button><button class="secondary" data-postponement="'+esc(x.postponement_id)+'" data-order="'+esc(x.order_id)+'" data-choice="refund">Full refund</button></div>':'<p>The original purchaser controls this booking and receives any refund.</p>')+'<p class="postponement-choice-status" role="status"></p></div></article>';}).join(''):'';
 }catch{if(!accountScope.isCurrent(account))return;target.hidden=false;target.textContent='Postponement choices could not load. Refresh or contact bookings@theticketbunker.com.';}
}
$('#postponed-bookings').onclick=async e=>{
 const b=e.target.closest('[data-postponement]');if(!b)return;
 const card=b.closest('article'),buttons=card.querySelectorAll('button');buttons.forEach(x=>x.disabled=true);
 try{const r=await api('event-postponement',{action:'choose',postponementId:b.dataset.postponement,orderId:b.dataset.order,choice:b.dataset.choice},await currentToken());card.querySelector('.postponement-choice-status').textContent=r.message;await Promise.allSettled([loadTickets(),loadPostponements(),loadCancellationRefunds()]);}
 catch(err){card.querySelector('.postponement-choice-status').textContent=err.message;buttons.forEach(x=>x.disabled=false);}
};

async function loadCancellationRefunds(){
 const account=accountScope.snapshot();
 const target=$('#cancellation-bookings');
 try{
  const r=await api('event-cancellation',null,await currentToken());
  if(!accountScope.isCurrent(account))return;
  target.hidden=!r.refunds?.length;
  target.innerHTML=r.refunds?.length?'<h2>Cancelled events & refunds</h2>'+r.refunds.map(x=>'<article class="ticket-card"><div><h3>'+esc(x.sb_events?.title||'Cancelled event')+'</h3><p>'+esc(money(x.sb_event_orders?.total_cents||0,x.sb_event_orders?.currency||'eur'))+' full booking refund</p><p>'+esc(x.refund_status==='refunded'?'Stripe has confirmed the refund to the original purchaser. Bank processing normally takes 5–10 working days.':x.refund_status==='review'?'Your cancellation refund is being checked. Support is monitoring this booking; no new request is needed.':'Your refund is queued or processing automatically. No refund request is needed.')+'</p><small>Transferred tickets are refunded to the original purchaser.</small></div></article>').join(''):'';
 }catch{if(!accountScope.isCurrent(account))return;target.hidden=false;target.textContent='Cancellation and refund status could not load. Refresh your tickets or contact bookings@theticketbunker.com.';}
}

async function loadPreferences(){const account=accountScope.snapshot();try{const d=await api('client-marketing-consent',null,await currentToken());if(!accountScope.isCurrent(account))return;$('#marketing-consent').checked=d.optedIn===true;}catch(e){if(accountScope.isCurrent(account))$('#preferences-status').textContent=e.message;}}
async function loadWeekly(){const account=accountScope.snapshot();try{const {preferences:p}=await api('promo-preferences',null,await currentToken());if(!accountScope.isCurrent(account))return;if(p){preferenceFields($('#weekly-fields'),p);$('#weekly-consent').checked=p.opted_in;}if(location.hash==='#weekly-picks')$('#weekly-picks').scrollIntoView();}catch(e){if(accountScope.isCurrent(account))$('#weekly-status').textContent=e.message;}}
$('#weekly-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const optedIn=$('#weekly-consent').checked;await api('promo-preferences',{...(optedIn?readPreferences($('#weekly-fields')):{}),optedIn},await currentToken());$('#weekly-status').textContent=optedIn?'Saved. Weekly picks will match your locations and interests. You can unsubscribe in every email.':'Weekly TicketBunker picks are switched off.';}catch(err){$('#weekly-status').textContent=err.message;}finally{b.disabled=false;}};
$('#login-tab').onclick=()=>setMode('login');$('#signup-tab').onclick=()=>setMode('signup');$('#forgot').onclick=()=>setMode('reset');
$('#show-password').onclick=()=>{const visible=$('#password').type==='password';$('#password').type=visible?'text':'password';$('#show-password').textContent=visible?'Hide':'Show';$('#show-password').setAttribute('aria-label',visible?'Hide password':'Show password');};
$('#auth-form').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;busy=true;$('#auth-submit').disabled=true;message('Please wait…');
 try{
  sb ||= await authClient();let result;
  const email=$('#email').value.trim(),password=$('#password').value;
  if(mode==='reset'){
   if(adminMode){const reply=await api('ticketbunker-password-reset',{email});message(reply.message);return;}
   result=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+loginPath+'&recovery=1'});
   if(result.error)throw result.error;message('If there is an account for that email, a password reset link is on its way.');return;
  }
  if(mode==='recover'){
   result=await sb.auth.updateUser({password});if(result.error)throw result.error;
   setMode('login');message('Password saved. Sign in with your new password to open '+(adminMode?'your TicketBunker control room.':'your account.'));await sb.auth.signOut();return;
  }
  result=mode==='signup'?await sb.auth.signUp({email,password,options:{emailRedirectTo:location.origin+'/login?role='+role+(next?'&next='+encodeURIComponent(next):''),data:{full_name:$('#full-name').value.trim(),name:$('#full-name').value.trim(),ticketbunker_marketing_signup_pending:$('#signup-marketing').checked}}}):await sb.auth.signInWithPassword({email,password});
  if(result.error)throw result.error;
  if(!result.data.session){message('Check your email to confirm your account, then sign in here.');return;}
  session=result.data.session;
  if(mode==='signup'&&$('#signup-marketing').checked){await api('client-marketing-consent',{source:'signup'},session.access_token).catch(()=>{});}
  busy=false;await enter(session);
 }catch(error){message(error.message||'Unable to sign in. Please try again.',true);}
 finally{busy=false;$('#auth-submit').disabled=false;}
});
if(params.get('mode')==='signup')setMode('signup');
$('#sign-out').onclick=async()=>{await sb.auth.signOut();tickets=[];$('#ticket-list').replaceChildren();showAuth();};
$('#refresh-tickets').onclick=async()=>{const button=$('#refresh-tickets');button.disabled=true;try{await Promise.allSettled([loadTickets(),loadPartnerBookings(),loadCancellationRefunds(),loadPostponements()]);}finally{button.disabled=false;}};
$('#preferences-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('client-marketing-consent',{source:'account',consent:$('#marketing-consent').checked},await currentToken());$('#preferences-status').textContent='Your preference is saved.';}catch(err){$('#preferences-status').textContent=err.message;}finally{b.disabled=false;}};
function updateBookingFilters(){
 $('#booking-count-tb').textContent=String(tickets.length);$('#booking-count-partner').textContent=String(partnerBookings.length);$('#booking-count-all').textContent=String(tickets.length+partnerBookings.length);
 $('#tb-bookings-section').hidden=bookingFilter==='partner';$('#partner-bookings-section').hidden=bookingFilter==='tb';
 document.querySelectorAll('[data-booking-filter]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.bookingFilter===bookingFilter)));
}
document.querySelector('.booking-filters').onclick=e=>{const button=e.target.closest('[data-booking-filter]');if(button){bookingFilter=button.dataset.bookingFilter;updateBookingFilters();}};
async function loadPartnerBookings(){
 const account=accountScope.snapshot();
 $('#partner-bookings-status').textContent='Loading partner bookings…';
 try{const result=await api('partner-bookings',null,await currentToken());if(!accountScope.isCurrent(account))return;partnerBookings=result.bookings||[];renderPartnerBookings();$('#partner-bookings-status').textContent='';}
 catch(error){if(accountScope.isCurrent(account))$('#partner-bookings-status').textContent='Partner bookings could not load. Your TB tickets are separate. '+error.message;}
}
function renderPartnerBookings(){
 $('#partner-booking-list').innerHTML=partnerBookings.length?partnerBookings.map(renderPartnerBooking).join(''):'<div class="empty-state partner-empty"><span class="eyebrow">ALL YOUR PLANS TOGETHER</span><h2>No partner bookings saved.</h2><p>While signed in, supplier visits can be saved here as unconfirmed. Add your booking details or confirmation after buying.</p><button class="secondary" type="button" data-add-partner>Add partner booking</button></div>';
 updateBookingFilters();
}
const supplierSelect=$('#partner-supplier');
supplierSelect.innerHTML='<option value="">Choose supplier</option>'+PARTNER_SUPPLIERS.map(supplier=>'<option value="'+esc(supplier.id)+'">'+esc(supplier.name)+'</option>').join('')+'<option value="other">Other supplier</option>';
function updateSupplierField(){const other=supplierSelect.value==='other';$('#partner-supplier-name-field').hidden=!other;$('#partner-supplier-name').required=other;}
supplierSelect.onchange=updateSupplierField;
function openPartnerForm(booking=null){
 partnerEditing=booking?.id||null;partnerRequestId=crypto.randomUUID();const form=$('#partner-booking-form');form.reset();
 supplierSelect.value=booking?(PARTNER_SUPPLIERS.some(x=>x.id===booking.providerId)?booking.providerId:'other'):'';
 $('#partner-supplier-name').value=booking?.providerName||'';updateSupplierField();
 $('#partner-title').value=booking?.title||'';$('#partner-date').value=booking?.startsAt?.slice(0,10)||'';$('#partner-venue').value=booking?.venue||'';$('#partner-reference').value=booking?.bookingReference||'';$('#partner-url').value=booking?.bookingUrl||'';
 $('#partner-reported').checked=booking?.status==='customer_added'||booking?.status==='provider_confirmed';
 $('#partner-dialog-heading').textContent=booking?'Your partner booking.':'Add your booking.';$('#partner-form-status').textContent='';$('#partner-form-status').classList.remove('error');
 // Supplier attribution of an existing saved booking is fixed; add a new record if the supplier changes.
 supplierSelect.disabled=!!booking;$('#partner-supplier-name').readOnly=!!booking;
 $('#partner-booking-dialog').showModal();
}
$('#add-partner-booking').onclick=()=>openPartnerForm();
$('#close-partner-dialog').onclick=()=>$('#partner-booking-dialog').close();
$('#partner-booking-list').onclick=async e=>{
 if(e.target.closest('[data-add-partner]'))return openPartnerForm();
 const button=e.target.closest('[data-partner-action]');if(!button)return;
 const booking=partnerBookings.find(x=>x.id===button.dataset.booking);if(!booking)return;
 if(button.dataset.partnerAction==='edit')return openPartnerForm(booking);
 const account=accountScope.snapshot();const status=button.closest('article').querySelector('.partner-card-message');button.disabled=true;
 let preview=null;
 if(button.dataset.partnerAction==='download'){preview=window.open('about:blank','_blank');if(preview)preview.opener=null;}
 try{
  if(button.dataset.partnerAction==='remove'){await api('partner-bookings',{action:'remove',bookingId:booking.id},await currentToken());if(!accountScope.isCurrent(account))return;partnerBookings=partnerBookings.filter(x=>x.id!==booking.id);renderPartnerBookings();$('#partner-bookings-status').textContent='Saved copy removed. Your supplier booking is unchanged.';}
  if(button.dataset.partnerAction==='download'){const result=await api('partner-bookings',{action:'download',bookingId:booking.id},await currentToken());if(!accountScope.isCurrent(account)){preview?.close();return;}const url=externalBookingUrl(result.url);if(!url)throw Error('Unable to open this confirmation. Please try again.');if(preview)preview.location.replace(url);else{status.replaceChildren();const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.dataset.partnerNoSave='';link.textContent='Open saved confirmation';status.append(link);}}
 }catch(error){preview?.close();if(accountScope.isCurrent(account))status.textContent=error.message;}finally{button.disabled=false;}
};
$('#partner-booking-form').onsubmit=async e=>{
 e.preventDefault();const account=accountScope.snapshot();const button=$('#save-partner-booking'),status=$('#partner-form-status'),file=$('#partner-document').files[0];button.disabled=true;status.textContent='Saving your booking…';status.classList.remove('error');
 let saved=false;
 try{
  validateConfirmationFile(file);const supplier=PARTNER_SUPPLIERS.find(x=>x.id===supplierSelect.value);const url=$('#partner-url').value.trim();
  if(url&&!externalBookingUrl(url))throw Error('Use an https:// supplier booking link.');
  const body={action:partnerEditing?'update':'save',...(partnerEditing?{bookingId:partnerEditing}:{providerId:supplier?.id||'other',providerName:supplier?.name||$('#partner-supplier-name').value.trim(),source:'manual',requestId:partnerRequestId}),title:$('#partner-title').value.trim(),startsAt:$('#partner-date').value?$('#partner-date').value+'T12:00:00Z':null,venue:$('#partner-venue').value.trim(),bookingReference:$('#partner-reference').value.trim(),bookingUrl:url,customerReported:$('#partner-reported').checked||!!file};
  const result=await api('partner-bookings',body,await currentToken());if(!accountScope.isCurrent(account))return;partnerEditing=result.booking?.id||partnerEditing;saved=true;supplierSelect.disabled=true;$('#partner-supplier-name').readOnly=true;
  if(file){if(!partnerEditing)throw Error('Your booking was saved. Refresh before adding the confirmation.');const base64=await confirmationBase64(file);if(!accountScope.isCurrent(account))return;await api('partner-bookings',{action:'document',bookingId:partnerEditing,fileName:file.name,mimeType:file.type,base64},await currentToken());}
  if(!accountScope.isCurrent(account))return;$('#partner-booking-dialog').close();await loadPartnerBookings();if(accountScope.isCurrent(account))$('#partner-bookings-status').textContent='Partner booking saved. The supplier remains responsible for your tickets.';
 }catch(error){if(!accountScope.isCurrent(account))return;status.textContent=(saved?'Booking details saved. Confirmation could not be added: ':'')+error.message;status.classList.add('error');if(saved)await loadPartnerBookings();}
 finally{button.disabled=false;}
};
$('#ticket-list').onclick=e=>{
 const b=e.target.closest('[data-change]');if(!b)return;
 const ticket=tickets.find(t=>t.id===b.dataset.ticket);if(!ticket||(b.dataset.change!=='refund'&&!ticket.canManage))return;
 change={ticket,action:b.dataset.change,clientRequestId:crypto.randomUUID()};const transfer=change.action==='transfer',refund=change.action==='refund';
 $('#refund-field').hidden=!refund;$('#refund-reason').required=refund;$('#refund-reason').value='';$('#holder-field').hidden=refund;$('#holder-name').required=!refund;$('#save-ticket-change').textContent=refund?'Submit refund request':'Save change';
 $('#dialog-heading').textContent=refund?'Request a refund.':transfer?'Transfer your ticket.':'Change attendee name.';
 $('#dialog-description').textContent=refund?'Changed plans or non-attendance do not normally qualify for a refund. The original purchaser can ask for review of a cancellation, event change or other problem, including after the event. Your legal rights remain protected. Explain what happened; submitting this form does not issue a refund.':transfer?'This moves the ticket to the recipient’s verified email account. Your old QR code will stop working. TicketBunker does not collect a resale payment.':'Enter the name of the person attending. Use the updated ticket after saving.';
 $('#holder-name').value=transfer?'':ticket.holderName;$('#recipient-field').hidden=!transfer;$('#recipient-email').required=transfer;$('#recipient-email').value='';$('#ticket-change-status').textContent='';$('#ticket-dialog').showModal();
};
$('#close-dialog').onclick=()=>$('#ticket-dialog').close();
$('#ticket-form').onsubmit=async e=>{
 e.preventDefault();if(!change)return;$('#save-ticket-change').disabled=true;
 try{if(change.action==='refund'){const r=await api('ticketbunker-support',{action:'create',clientRequestId:change.clientRequestId,category:'refund',ticketId:change.ticket.id,subject:'Refund review: '+String(change.ticket.title||'Ticket booking').slice(0,140),body:$('#refund-reason').value.trim()},await currentToken());$('#ticket-dialog').close();const status=$('#tickets-status');status.textContent='Refund enquiry saved'+(r.case?.reference?' · '+r.case.reference:'')+'. Submitting a request does not issue a refund.'+(r.notification?.state==='queued'?' The email acknowledgement is queued.':'');if(r.case?.id){const link=document.createElement('a');link.href='/support?case='+encodeURIComponent(r.case.id);link.textContent=' View case and updates ↗';status.append(link);}return;}const result=await api('my-event-ticket-transfer',{ticketId:change.ticket.id,action:change.action,name:$('#holder-name').value.trim(),recipientEmail:$('#recipient-email').value.trim()},await currentToken());$('#ticket-dialog').close();await loadTickets();$('#tickets-status').textContent=result.transferred?(result.emailSent?'Ticket transferred. The recipient has been emailed.':'Ticket transferred. The recipient can find it by signing in with their email; the notification email could not be sent.'):'Attendee name updated.';}catch(err){$('#ticket-change-status').textContent=err.message;$('#ticket-change-status').classList.add('error');}finally{$('#save-ticket-change').disabled=false;}
};
(async()=>{
 try{
  sb=await authClient();
  const recovery=params.has('recovery')||params.has('invite')||params.has('token_hash')||location.hash.includes('type=recovery')||location.hash.includes('type=invite');
  sb.auth.onAuthStateChange((event,s)=>{if(event==='PASSWORD_RECOVERY'){showAuth();setMode('recover');}else if(event==='SIGNED_OUT')showAuth();else if(event==='TOKEN_REFRESHED')session=s;});
  const tokenHash=params.get('token_hash');
  if(tokenHash){history.replaceState(null,'',loginPath+'&recovery=1');const verified=await sb.auth.verifyOtp({token_hash:tokenHash,type:params.has('invite')?'invite':'recovery'});params.delete('token_hash');if(verified.error)throw Error('This password link has expired or was already used. Select Forgot your password to request a new TicketBunker link.');}
  const {data,error}=await sb.auth.getSession();if(error)throw error;
  if(recovery&&data.session){showAuth();setMode('recover');}
  else if(data.session)await enter(data.session);else showAuth();
 }catch(e){showAuth();message(e.message,true);}
})();
