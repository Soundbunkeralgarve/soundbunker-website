(async()=>{
 const p=new URLSearchParams(location.search),id=p.get('id'),sig=p.get('sig');
 const title=document.getElementById('name'),details=document.getElementById('details'),notice=document.getElementById('notice');
 if(!id||!sig){title.textContent='Ticket link incomplete';return;}
 try{
  const r=await fetch('/api/event-ticket?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig),{cache:'no-store'});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Ticket unavailable');
  const t=data.ticket;title.textContent=t.title;
  const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:t.timezone||'Europe/Lisbon'}).format(new Date(t.date));
  details.textContent=date+' (venue time) • '+t.venue+' • '+t.tier;
  if(t.used){notice.textContent='This ticket has already been checked in.';return;}
  if(typeof QRCode!=='function')throw Error('QR generator unavailable. Keep this page open and ask staff to look up your ticket.');
  new QRCode(document.getElementById('qr'),{text:'https://www.soundbunker.pt/event-ticket.html?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig),width:240,height:240,correctLevel:QRCode.CorrectLevel.M});
 }catch(e){title.textContent='Unable to display ticket';notice.textContent=e.message;}
})();