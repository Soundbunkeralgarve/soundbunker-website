const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const code=new URLSearchParams(location.search).get('code')||'';
async function init(){
 if(!/^[a-f0-9]{48}$/.test(code)){$('eventTitle').textContent='Test invitation missing';$('result').textContent='Ask the SoundBunker admin for the private free-ticket test link.';return;}
 try{
  const r=await fetch('/api/event-free-test?code='+encodeURIComponent(code),{cache:'no-store'});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Test invitation unavailable');
  const ev=data.event;
  $('eventTitle').textContent=ev.title;
  $('eventInfo').textContent=ev.venue+' · '+new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:ev.timezone||'Europe/Lisbon'}).format(new Date(ev.date))+' (venue time)';
  $('claimForm').classList.remove('hide');
  $('result').textContent='Test invitation verified. Enter your details to claim one or two real €0 tickets.';
 }catch(e){$('eventTitle').textContent='Test unavailable';$('result').textContent=e.message;}
}
$('claimForm').addEventListener('submit',async e=>{
 e.preventDefault();const form=e.currentTarget,button=$('book');
 const d=Object.fromEntries(new FormData(form));
 button.disabled=true;$('result').textContent='Issuing real test tickets in the SoundBunker database…';$('links').replaceChildren();
 try{
  const r=await fetch('/api/event-free-test',{method:'POST',headers:{'content-type':'application/json'},
   body:JSON.stringify({action:'claim',code,name:d.name,email:d.email,quantity:Number(d.quantity)})});
  const result=await r.json();if(!r.ok)throw Error(result.error||'Unable to issue test tickets');
  $('result').textContent=result.quantity+' real €0 test ticket(s) issued. '+(result.emailSent?'An email has also been sent.':'Email delivery was not confirmed; use the links below.');
  for(const ticket of result.tickets){
   const link=document.createElement('a');link.href=ticket.url;link.className='ticketlink';link.rel='noreferrer';
   link.textContent='Open REAL test QR ticket '+ticket.number+' →';link.target='_blank';$('links').appendChild(link);
  }
  form.classList.add('hide');
 }catch(err){$('result').textContent=err.message;button.disabled=false;}
});
init();
