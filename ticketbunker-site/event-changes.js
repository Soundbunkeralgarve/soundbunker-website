import {$,api,escapeHtml as esc,date} from './shared.js';
let eventId=null;
const dialog=document.createElement('dialog');dialog.className='cancellation-dialog';dialog.innerHTML='<button type="button" class="ghost" id="close-postponement">Close ×</button><h2>Postpone & reschedule</h2><div id="postponement-summary"></div><form id="postponement-form"><p><strong>£10 GBP including applicable tax.</strong> Available until 48 hours before the original start. Your event stays unchanged until Stripe confirms payment.</p><p>Payment pauses sales and moves the same event into an editable draft. Buyers are emailed a choice of full refund or keeping the booking. Set the new date and details, then repost the linked event when ready; kept tickets retain their QR codes.</p><label>Reason<textarea name="reason" minlength="10" maxlength="1200" required rows="3"></textarea></label><label class="check"><input name="acceptCosts" type="checkbox" required><span>I confirm the £10 GBP charge and organiser liability for actual unrecovered processing/refund costs for refunded bookings, without deducting fees from buyer refunds.</span></label><button type="submit" class="primary">Pay £10 GBP & postpone →</button></form><p id="postponement-status" role="status"></p>';document.body.append(dialog);
async function token(){const {data}=await window.ticketbunkerAuth.auth.getSession();if(!data.session)throw Error('Please sign in again.');return data.session.access_token;}
async function open(id){
 eventId=id;$('#postponement-form').hidden=true;$('#postponement-status').textContent='Loading postponement details…';if(!dialog.open)dialog.showModal();
 try{
  const d=await api('event-postponement?eventId='+encodeURIComponent(id),null,await token());if(eventId!==id)return;
  const applied=!!d.postponement?.applied_at;
  $('#postponement-form').hidden=applied||!d.eligible;
  $('#postponement-summary').innerHTML=applied?'<p><strong>Your linked rescheduled draft is ready.</strong></p><p>'+d.choices.rollover+' bookings kept · '+d.choices.refund+' refund choices · '+d.choices.pending+' awaiting a choice.</p><button class="primary" id="edit-postponed" type="button">Edit & repost rescheduled event →</button>':d.eligible?'<p>'+esc(d.event.title)+' · original start '+esc(date(d.event.starts_at))+'.</p>':'<p>Self-service postponement closes 48 hours before the original start. Full cancellation and support remain separate options.</p>';
  if($('#edit-postponed'))$('#edit-postponed').onclick=()=>{dialog.close();window.dispatchEvent(new CustomEvent('ticketbunker:edit-event',{detail:id}));};
  if(d.history.length)$('#postponement-summary').insertAdjacentHTML('beforeend','<h3>Linked event history</h3>'+d.history.map(p=>'<p>Original: '+esc(date(p.original_starts_at))+' → '+esc(p.new_starts_at?date(p.new_starts_at):p.applied_at?'New date being arranged':'Payment awaiting confirmation')+'</p>').join(''));
  $('#postponement-status').textContent=applied?'Set the new date and details in the existing draft. Reposting automatically emails the new details.':'Buyers are notified only after verified payment. The £25 full-cancellation option remains separate.';
 }catch(e){$('#postponement-status').textContent=e.message;}
}
$('#close-postponement').onclick=()=>dialog.close();
document.addEventListener('click',e=>{const b=e.target.closest('[data-postpone]');if(b)open(b.dataset.postpone);});
$('#postponement-form').onsubmit=async e=>{
 e.preventDefault();const b=e.submitter;b.disabled=true;
 try{const r=await api('event-postponement',{action:'checkout',eventId,reason:e.currentTarget.elements.reason.value,acceptCosts:e.currentTarget.elements.acceptCosts.checked},await token());if(r.postponed){await window.ticketbunkerRefresh();await open(eventId);return;}const u=new URL(r.url);if(u.origin!=='https://checkout.stripe.com')throw Error('Invalid payment link');location.assign(u.href);}
 catch(err){$('#postponement-status').textContent=err.message;}finally{b.disabled=false;}
};
async function returned(){
 const p=new URLSearchParams(location.search);if(!p.has('postponement')||!p.get('event'))return;
 const id=p.get('event');try{let message='Payment was not completed. Your event is unchanged.';if(p.get('postponement')==='returned'){const r=await api('event-postponement',{action:'status',eventId:id},await token());message=r.message;}await window.ticketbunkerRefresh();await open(id);$('#postponement-status').textContent=message;}catch(e){await open(id);$('#postponement-status').textContent=e.message;}
}
window.addEventListener('ticketbunker:ready',returned);
