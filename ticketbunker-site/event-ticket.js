(async()=>{
 const $=id=>document.getElementById(id),p=new URLSearchParams(location.search),id=p.get('id'),sig=p.get('sig');
 if(!id||!sig){$('name').textContent='Ticket link incomplete';$('notice').textContent='Open the secure ticket link from My tickets.';return;}
 try{
  const response=await fetch('/api/event-ticket?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig),{cache:'no-store'});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Ticket unavailable');const t=data.ticket;
  if(t.test)throw Error('This ticket is not valid for admission.');
  $('name').textContent=t.title;$('ticketTierMark').textContent=t.tier||'GENERAL ADMISSION';$('ticketHolder').textContent=t.holderName||'Ticket holder';$('ticketNumber').textContent=t.admissionNumber?String(t.admissionNumber).padStart(2,'0'):'—';$('ticketReference').textContent='Ticket reference · '+id;
  const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:t.timezone||'Europe/Lisbon'}).format(new Date(t.date));
  $('details').textContent=date+' · venue local time · '+t.venue;
  if(t.poster&&/^https:\/\//i.test(t.poster)){const img=document.createElement('img');img.src=t.poster;img.alt='Official event artwork';$('ticketArtwork').append(img);}
  if(t.eventLogo&&/^https:\/\//i.test(t.eventLogo)){const img=document.createElement('img');img.src=t.eventLogo;img.alt='Promoter logo';img.className='event-brand-mark';$('ticketArtwork').append(img);}
  if(t.used){$('ticketTierMark').textContent='ALREADY CHECKED IN';$('notice').textContent='This ticket has already been used for admission.';return;}
  if(typeof QRCode!=='function')throw Error('QR could not be generated. Refresh this page or ask the door team for help.');
  const ticketUrl=location.origin+'/event-ticket?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig);
  new QRCode($('qr'),{text:ticketUrl,width:180,height:180,correctLevel:QRCode.CorrectLevel.M});
  $('ticketActions').hidden=false;$('printTicket').onclick=()=>window.print();
  $('saveTicket').onclick=()=>{const image=document.querySelector('#qr img'),canvas=document.querySelector('#qr canvas'),href=image?.src||canvas?.toDataURL('image/png');if(!href)return;$('notice').textContent='Keep your saved QR private.';const a=document.createElement('a');a.href=href;a.download='ticketbunker-'+id.slice(0,8)+'.png';a.click();};
 }catch(error){$('name').textContent='Ticket unavailable';$('ticketTierMark').textContent='UNAVAILABLE';$('details').textContent='';$('notice').textContent=error.message;}
})();
