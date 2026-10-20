import {$,api,authClient,escapeHtml as esc,date,safeUrl,safeNext,money} from './shared.js';
import {preferenceFields,readPreferences} from './promo-options.js';
preferenceFields(document.querySelector('#weekly-fields'));
const params=new URLSearchParams(location.search);
const oldRole=location.hash==='#organisers'?'organiser':'';
const next=safeNext(params.get('next'));
const role=params.get('role')==='organiser'||oldRole||next.startsWith('/organiser')?'organiser':'buyer';
let mode='login',sb,session,tickets=[],change=null,busy=false;
const adminMode=next==='/control-room';
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
function showAuth(){session=null;$('#account').hidden=true;$('#auth').hidden=false;$('#boot-status').hidden=true;}
async function enter(s){
 if(busy)return;
 const user=await sb.auth.getUser();
 if(user.error||!user.data.user){showAuth();message('Please sign in again.',true);return;}
 session=s;
 if(!user.data.user.email_confirmed_at){showAuth();message('Confirm your email address using the email we sent before signing in.',true);return;}
 if(user.data.user.user_metadata?.ticketbunker_marketing_signup_pending===true){await api('client-marketing-consent',{source:'signup'},s.access_token).catch(()=>{});}
 if(returnTo!=='/my-tickets'){location.replace(returnTo);return;}
 $('#boot-status').hidden=true;$('#auth').hidden=true;$('#account').hidden=false;
 $('#account-email').textContent=user.data.user.email;
 document.title='My tickets | TicketBunker';
 await Promise.allSettled([loadTickets(),loadPreferences(),loadWeekly(),loadCancellationRefunds(),loadPostponements()]);
}
async function currentToken(){const {data,error}=await sb.auth.getSession();if(error||!data.session){showAuth();throw Error('Your session expired. Please sign in.');}session=data.session;return session.access_token;}
async function loadTickets(){
 $('#tickets-status').textContent='Loading your tickets…';$('#refresh-tickets').disabled=true;
 try{
  tickets=(await api('my-event-tickets',null,await currentToken())).tickets||[];
  $('#ticket-list').innerHTML=tickets.length?tickets.map(t=>`<article class="ticket-card">${t.poster&&safeUrl(t.poster)?`<img class="poster" src="${esc(safeUrl(t.poster))}" alt="${esc(t.title)} poster" loading="lazy">`:'<div class="poster poster-placeholder" aria-hidden="true">TB</div>'}<div><span class="status-tag">${t.used?'CHECKED IN':Date.parse(t.startsAt)<Date.now()?'PAST EVENT':'YOUR ADMISSION'}</span><h2>${esc(t.title)}</h2><p>${esc(date(t.startsAt,t.timezone))}</p><p>${esc(t.venue)}</p><p><strong>${esc(t.ticketName)}</strong> · ${esc(t.holderName)}</p></div><div class="ticket-actions"><a class="primary" href="${esc(safeUrl(t.url))}">View ticket ↗</a>${t.canManage?`<button class="secondary" data-change="name" data-ticket="${esc(t.id)}">Change name</button><button class="secondary" data-change="transfer" data-ticket="${esc(t.id)}">Transfer ticket</button>`:''}<button class="text-button" data-change="refund" data-ticket="${esc(t.id)}">Request a refund</button></div></article>`).join(''):'<div class="empty-state"><span class="eyebrow">YOUR NEXT NIGHT STARTS HERE</span><h2>No tickets yet.</h2><p>Tickets bought with your verified email will appear here.</p><a class="primary" href="/#discover">Explore events ↗</a></div>';
  $('#tickets-status').textContent='';
 }catch(e){$('#tickets-status').textContent=e.message;}
 finally{$('#refresh-tickets').disabled=false;}
}
async function loadPostponements(){
 const target=$('#postponed-bookings');
 try{
  const r=await api('event-postponement',null,await currentToken());target.hidden=!r.choices?.length;
  target.innerHTML=r.choices?.length?'<h2>Postponed & rescheduled bookings</h2>'+r.choices.map(x=>{const p=x.tb_event_postponements,newDate=p.new_starts_at?date(p.new_starts_at,x.sb_events.venue_timezone):'New date being arranged',state=x.choice==='refund'?'Full refund selected. Your tickets cannot be used.':x.choice==='rollover'?'Booking kept. Your original ticket and QR remain linked to the reposted event.':'Choose what to do with this booking. Admission is paused until you keep it.';return '<article class="ticket-card"><div><h3>'+esc(x.sb_events.title)+'</h3><p>'+esc(newDate)+'</p><p>'+esc(state)+'</p><p>'+esc(money(x.sb_event_orders.total_cents,x.sb_event_orders.currency))+' · choice applies to all tickets in this booking.</p>'+(x.canChoose&&x.choice!=='refund'?'<div class="button-row"><button class="secondary" data-postponement="'+esc(x.postponement_id)+'" data-order="'+esc(x.order_id)+'" data-choice="rollover">Keep booking / roll over</button><button class="secondary" data-postponement="'+esc(x.postponement_id)+'" data-order="'+esc(x.order_id)+'" data-choice="refund">Full refund</button></div>':'<p>The original purchaser controls this booking and receives any refund.</p>')+'<p class="postponement-choice-status" role="status"></p></div></article>';}).join(''):'';
 }catch{target.hidden=false;target.textContent='Postponement choices could not load. Refresh or contact bookings@theticketbunker.com.';}
}
$('#postponed-bookings').onclick=async e=>{
 const b=e.target.closest('[data-postponement]');if(!b)return;
 const card=b.closest('article'),buttons=card.querySelectorAll('button');buttons.forEach(x=>x.disabled=true);
 try{const r=await api('event-postponement',{action:'choose',postponementId:b.dataset.postponement,orderId:b.dataset.order,choice:b.dataset.choice},await currentToken());card.querySelector('.postponement-choice-status').textContent=r.message;await Promise.allSettled([loadTickets(),loadPostponements(),loadCancellationRefunds()]);}
 catch(err){card.querySelector('.postponement-choice-status').textContent=err.message;buttons.forEach(x=>x.disabled=false);}
};

async function loadCancellationRefunds(){
 const target=$('#cancellation-bookings');
 try{
  const r=await api('event-cancellation',null,await currentToken());
  target.hidden=!r.refunds?.length;
  target.innerHTML=r.refunds?.length?'<h2>Cancelled events & refunds</h2>'+r.refunds.map(x=>'<article class="ticket-card"><div><h3>'+esc(x.sb_events?.title||'Cancelled event')+'</h3><p>'+esc(money(x.sb_event_orders?.total_cents||0,x.sb_event_orders?.currency||'eur'))+' full booking refund</p><p>'+esc(x.refund_status==='refunded'?'Stripe has confirmed the refund to the original purchaser. Bank processing normally takes 5–10 working days.':x.refund_status==='review'?'Your cancellation refund is being checked. Support is monitoring this booking; no new request is needed.':'Your refund is queued or processing automatically. No refund request is needed.')+'</p><small>Transferred tickets are refunded to the original purchaser.</small></div></article>').join(''):'';
 }catch{target.hidden=false;target.textContent='Cancellation and refund status could not load. Refresh your tickets or contact bookings@theticketbunker.com.';}
}

async function loadPreferences(){try{const d=await api('client-marketing-consent',null,await currentToken());$('#marketing-consent').checked=d.optedIn===true;}catch(e){$('#preferences-status').textContent=e.message;}}
async function loadWeekly(){try{const {preferences:p}=await api('promo-preferences',null,await currentToken());if(p){preferenceFields($('#weekly-fields'),p);$('#weekly-consent').checked=p.opted_in;}if(location.hash==='#weekly-picks')$('#weekly-picks').scrollIntoView();}catch(e){$('#weekly-status').textContent=e.message;}}
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
$('#refresh-tickets').onclick=()=>Promise.allSettled([loadTickets(),loadCancellationRefunds(),loadPostponements()]);
$('#preferences-form').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await api('client-marketing-consent',{source:'account',consent:$('#marketing-consent').checked},await currentToken());$('#preferences-status').textContent='Your preference is saved.';}catch(err){$('#preferences-status').textContent=err.message;}finally{b.disabled=false;}};
$('#ticket-list').onclick=e=>{
 const b=e.target.closest('[data-change]');if(!b)return;
 const ticket=tickets.find(t=>t.id===b.dataset.ticket);if(!ticket||(b.dataset.change!=='refund'&&!ticket.canManage))return;
 change={ticket,action:b.dataset.change};const transfer=change.action==='transfer',refund=change.action==='refund';
 $('#refund-field').hidden=!refund;$('#refund-reason').required=refund;$('#refund-reason').value='';$('#holder-field').hidden=refund;$('#holder-name').required=!refund;$('#save-ticket-change').textContent=refund?'Submit refund request':'Save change';
 $('#dialog-heading').textContent=refund?'Request a refund.':transfer?'Transfer your ticket.':'Change attendee name.';
 $('#dialog-description').textContent=refund?'Changed plans or non-attendance do not normally qualify for a refund. The original purchaser can ask for review of a cancellation, event change or other problem, including after the event. Your legal rights remain protected. Explain what happened; submitting this form does not issue a refund.':transfer?'This moves the ticket to the recipient’s verified email account. Your old QR code will stop working. TicketBunker does not collect a resale payment.':'Enter the name of the person attending. Use the updated ticket after saving.';
 $('#holder-name').value=transfer?'':ticket.holderName;$('#recipient-field').hidden=!transfer;$('#recipient-email').required=transfer;$('#recipient-email').value='';$('#ticket-change-status').textContent='';$('#ticket-dialog').showModal();
};
$('#close-dialog').onclick=()=>$('#ticket-dialog').close();
$('#ticket-form').onsubmit=async e=>{
 e.preventDefault();if(!change)return;$('#save-ticket-change').disabled=true;
 try{if(change.action==='refund'){const r=await api('refund-request',{ticketId:change.ticket.id,reason:$('#refund-reason').value.trim()},await currentToken());$('#ticket-dialog').close();$('#tickets-status').textContent=r.message;return;}const result=await api('my-event-ticket-transfer',{ticketId:change.ticket.id,action:change.action,name:$('#holder-name').value.trim(),recipientEmail:$('#recipient-email').value.trim()},await currentToken());$('#ticket-dialog').close();await loadTickets();$('#tickets-status').textContent=result.transferred?(result.emailSent?'Ticket transferred. The recipient has been emailed.':'Ticket transferred. The recipient can find it by signing in with their email; the notification email could not be sent.'):'Attendee name updated.';}catch(err){$('#ticket-change-status').textContent=err.message;$('#ticket-change-status').classList.add('error');}finally{$('#save-ticket-change').disabled=false;}
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
