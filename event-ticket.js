(async()=>{const p=new URLSearchParams(location.search),id=p.get('id'),sig=p.get('sig'),$=s=>document.querySelector(s);
const validImage=u=>typeof u==='string'&&u.startsWith('https://');
const name=$('#name'),details=$('#details'),notice=$('#notice');
if(!id||!sig){name.textContent='Ticket link incomplete';notice.textContent='Check your original ticket link.';return;}
try{
 const response=await fetch('/api/event-ticket?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig),{cache:'no-store'});
 const data=await response.json();if(!response.ok)throw Error(data.error||'Ticket unavailable');
 const t=data.ticket;
 name.textContent=t.title||'Your event';
 if(t.headliner){$('#headliner').hidden=false;$('#headliner').textContent=t.headliner;}
 const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:t.timezone||'Europe/Lisbon'}).format(new Date(t.date));
 const parts=[date+' (local venue time)',t.venue,t.tier];details.replaceChildren();
 for(const value of parts){const item=document.createElement('p');item.textContent=value||'';details.appendChild(item);}
 if(validImage(t.poster)){const img=document.createElement('img');img.src=t.poster;img.alt='Official event poster';$('#ticketArt').replaceChildren(img);}
 if(validImage(t.organiserLogo)){const img=$('#organiserLogo');img.src=t.organiserLogo;img.hidden=false;$('#organiserName').hidden=true;}
 else $('#organiserName').textContent=t.organiser||'Event organiser';
 $('#ticketRef').textContent='TICKET REF '+id.slice(0,8).toUpperCase()+' · TICKETBUNKER';
 if(t.used){notice.textContent='This ticket has already been checked in. It cannot be used for a second entry.';return;}
 if(typeof QRCode!=='function')throw Error('QR code could not be loaded. Keep the ticket link and ask event staff for assistance.');
 new QRCode($('#qr'),{text:'https://www.soundbunker.pt/event-ticket.html?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig),width:230,height:230,correctLevel:QRCode.CorrectLevel.M});
 notice.textContent='Ready for entry · Show this QR to the authorised door team.';
}catch(error){name.textContent='Ticket unavailable';notice.textContent=error.message;}})();