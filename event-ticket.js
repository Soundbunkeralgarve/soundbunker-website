(async()=>{
 const p=new URLSearchParams(location.search),id=p.get('id'),sig=p.get('sig');
 const title=document.getElementById('name'),details=document.getElementById('details'),notice=document.getElementById('notice');
 if(!id||!sig){title.textContent='Ticket link incomplete';return;}
 try{
  const r=await fetch('/api/event-ticket?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig),{cache:'no-store'});
  const data=await r.json();if(!r.ok)throw Error(data.error||'Ticket unavailable');
  const t=data.ticket;title.textContent=t.title;
  const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:t.timezone||'Europe/Lisbon'}).format(new Date(t.date));
  details.textContent=date+' (venue time) • '+t.venue+' • '+t.tier+(t.priceCents===0?' • FREE €0/£0':'');
  const art=document.getElementById('ticketArtwork');
  if(t.poster&&/^https:\/\//i.test(t.poster)){const cover=document.createElement('img');cover.src=t.poster;cover.alt='Event cover';art.appendChild(cover);}
  if(t.eventLogo&&/^https:\/\//i.test(t.eventLogo)){const logo=document.createElement('img');logo.src=t.eventLogo;logo.alt='Event logo';logo.className='event-brand-mark';art.appendChild(logo);}
  const ticketUrl=location.origin+location.pathname+'?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig);
  const text='Your ticket for '+t.title+' • '+t.venue+' • '+date+' • '+ticketUrl+' (valid for one entry)';
  document.getElementById('shareTicketWhatsApp').href='https://wa.me/?text='+encodeURIComponent(text);
  document.getElementById('shareTicketEmail').href='mailto:?subject='+encodeURIComponent('Your ticket: '+t.title)+'&body='+encodeURIComponent(text);
  document.getElementById('printTicket').onclick=()=>window.print();
  document.getElementById('saveTicket').onclick=()=>{
   const qr=document.querySelector('#qr img, #qr canvas');
   if(!qr){notice.textContent='QR image not ready — try again in a moment.';return;}
   const href=qr.tagName==='IMG'?qr.src:qr.toDataURL('image/png');
   const a=document.createElement('a');a.href=href;a.download='ticketbunker-'+id.slice(0,8)+'-qr.png';a.click();
  };
  if(t.test){
    const banner=document.createElement('p');banner.textContent='REAL QR SYSTEM TEST — NO PUBLIC EVENT / NO ADMISSION VALUE';
    banner.style.cssText='padding:12px;background:#ffe8b8;color:#452709;font-weight:850;border-radius:8px;margin:15px 0;';
    title.before(banner);
  }
  if(t.used){notice.textContent='This ticket has already been checked in.';return;}
  if(typeof QRCode!=='function')throw Error('QR generator unavailable. Keep this page open and ask staff to look up your ticket.');
  new QRCode(document.getElementById('qr'),{text:ticketUrl,width:240,height:240,correctLevel:QRCode.CorrectLevel.M});
  if(p.get('print')==='1')setTimeout(()=>window.print(),900);
 }catch(e){title.textContent='Unable to display ticket';notice.textContent=e.message;}
})();