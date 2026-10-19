(async()=>{
 const $=id=>document.getElementById(id),p=new URLSearchParams(location.search),preview=['/ticket-preview','/ticket-preview.html'].includes(location.pathname),id=preview?'design-preview':p.get('id'),sig=p.get('sig');
 if(!preview&&(!id||!sig)){$('name').textContent='Ticket link incomplete';$('ticketTierMark').textContent='NO VALID TICKET';$('details').textContent='Open My tickets or use the full ticket link from your booking email.';$('notice').textContent='This page cannot be used for entry without a valid ticket link.';return;}
 try{
  let t;
  if(preview){
   // Public design sample only: no booking, signed admission URL or wallet action.
   t={title:'After Dark · Live Sessions',tier:'DESIGN PREVIEW · NOT VALID FOR ENTRY',holderName:'Sample guest',admissionNumber:1,date:'2030-12-14T21:00:00Z',endDate:'2030-12-15T02:00:00Z',timezone:'Europe/Lisbon',venue:'The Hub Culture · Loulé',venueCity:'Loulé, Algarve',admissionInfo:'Example only · no event booking',poster:location.origin+'/assets/club.jpg',eventLogo:location.origin+'/assets/soundbunker-logo.png',organiserName:'SoundBunker Algarve',wallet:{apple:false,google:false}};
   document.querySelector('.ticket-intro h1').textContent='A ticket worth keeping.';
   document.querySelector('.ticket-intro p').textContent='Design preview only. This sample is not a real booking and cannot be used for entry.';
   document.querySelector('.ticket-masthead span').textContent='DESIGN PREVIEW · NOT VALID FOR ENTRY';
   $('notice').textContent='DESIGN PREVIEW ONLY · No booking or payment. Not valid for event admission.';
  }else{
   const response=await fetch('/api/event-ticket?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig),{cache:'no-store',signal:AbortSignal.timeout(30000)});
   const data=await response.json();if(!response.ok)throw Error(data.error||'Ticket unavailable');t=data.ticket;
  }
  if(t.test&&!t.walletTest)throw Error('This ticket is not valid for admission.');
  $('name').textContent=t.title;$('ticketTierMark').textContent=t.tier||'GENERAL ADMISSION';$('ticketHolder').textContent=t.holderName||'Ticket holder';$('ticketNumber').textContent=t.admissionNumber?String(t.admissionNumber).padStart(2,'0'):'—';$('ticketReference').textContent='Ticket reference · '+id;
  const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:t.timezone||'Europe/Lisbon'}).format(new Date(t.date));
  $('details').textContent=date+' · venue local time · '+t.venue;
  const facts=[t.headlineArtist?'On the bill: '+t.headlineArtist:'',t.venueCity?'Location: '+t.venueCity:'',t.endDate?'Finishes: '+new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:t.timezone||'Europe/Lisbon'}).format(new Date(t.endDate)):'',t.admissionInfo?'Entry: '+t.admissionInfo:''].filter(Boolean).join('\n');
  $('ticket-extra-facts').textContent=facts;
  const orderTotal=Number(t.orderTotalCents),quantity=Number(t.orderQuantity);
  const hasAmount=Number.isSafeInteger(orderTotal)&&orderTotal>=0&&Number.isInteger(quantity)&&quantity>0;
  const priceText=preview?'Design preview · no booking or payment.':t.test?'Private rehearsal · no payment taken.':hasAmount?'Booking total: '+new Intl.NumberFormat('en-GB',{style:'currency',currency:(t.currency||'eur').toUpperCase()}).format(orderTotal/100)+' · '+quantity+' ticket(s). Includes applicable VAT / IVA.':'Ticket price includes applicable VAT / IVA.';
  $('ticket-price-info').textContent=priceText+' This admission pass is not a fiscal invoice.';
  if(t.slug){$('ticket-event-link').href='/event/'+encodeURIComponent(t.slug);$('ticket-event-link').hidden=false;}
  if(t.description){$('ticket-description').textContent=t.description;$('ticket-description-wrap').hidden=false;}
  $('ticket-event-detail').hidden=false;
  if(t.test)document.querySelector('.ticket-masthead span').textContent='PRIVATE TEST TICKET';
  if(t.test)$('notice').textContent='PRIVATE WALLET & SCANNER TEST · €0 · Not valid for admission to a public event.';
  if(t.organiserName){$('organiserName').textContent=t.organiserName;$('ticketOrganiser').hidden=false;}
  if(t.poster&&/^https:\/\//i.test(t.poster)){const img=document.createElement('img');img.src=t.poster;img.alt=t.title+' · event artwork';$('ticketArtwork').append(img);}
  if(t.eventLogo&&/^https:\/\//i.test(t.eventLogo)){const img=document.createElement('img');img.src=t.eventLogo;img.alt='Organiser logo';$('organiserLogo').append(img);$('ticketOrganiser').hidden=false;}
  if(t.used){$('ticketTierMark').textContent='ALREADY CHECKED IN';$('notice').textContent='This ticket has already been used for admission.';return;}
  if(typeof QRCode!=='function')throw Error('QR could not be generated. Refresh this page or ask the door team for help.');
  const ticketUrl=preview?'TICKETBUNKER-DESIGN-PREVIEW-NOT-VALID-FOR-ENTRY':location.origin+'/event-ticket?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig);
  new QRCode($('qr'),{text:ticketUrl,width:232,height:232,correctLevel:QRCode.CorrectLevel.M});
  $('ticketActions').hidden=false;
  $('walletActions').hidden=!(t.wallet?.apple||t.wallet?.google);
  const walletEndpoint='/api/event-wallet?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig);
  if(t.wallet?.apple){$('appleWallet').href=walletEndpoint+'&provider=apple';$('appleWallet').hidden=false;}
  if(t.wallet?.google){$('googleWallet').hidden=false;$('googleWallet').onclick=async()=>{
   const button=$('googleWallet');button.disabled=true;
   try{const response=await fetch(walletEndpoint+'&provider=google',{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'Wallet unavailable');if(!result.url?.startsWith('https://pay.google.com/gp/v/save/'))throw Error('Invalid wallet link');location.assign(result.url);}catch(error){$('notice').textContent=error.message;}finally{button.disabled=false;}
  };}
  const requestedWallet=p.get('wallet');
  if(['apple','google'].includes(requestedWallet)){
   const clean=new URL(location.href);clean.searchParams.delete('wallet');history.replaceState(null,'',clean);
   if(t.wallet?.[requestedWallet]){if(requestedWallet==='apple')location.assign($('appleWallet').href);else $('googleWallet').click();}
   else $('notice').textContent='This wallet is currently unavailable for your ticket. Your admission QR is still valid.';
  }
$('printTicket').onclick=()=>window.print();
  $('saveDigitalTicket').onclick=async()=>{
   const button=$('saveDigitalTicket');button.disabled=true;
   try{
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=6000;const c=canvas.getContext('2d');
    c.fillStyle='#fff';c.fillRect(0,0,1080,6000);c.fillStyle='#000';c.fillRect(0,0,1080,165);
    const image=async src=>new Promise(resolve=>{if(!src){resolve(null);return;}const img=new Image();img.crossOrigin='anonymous';const timer=setTimeout(()=>resolve(null),5000);img.onload=()=>{clearTimeout(timer);resolve(img)};img.onerror=()=>{clearTimeout(timer);resolve(null)};img.src=src;});
    const [logo,poster,promoter,poweredBy,appleBadge,googleBadge]=await Promise.all([image('/brand-compact.png'),image(/^https:\/\//i.test(t.poster||'')?t.poster:null),image(/^https:\/\//i.test(t.eventLogo||'')?t.eventLogo:null),image('/soundbunker-logo-white.png'),image(t.wallet?.apple?'/assets/wallet/add-to-apple-wallet.png':null),image(t.wallet?.google?'/assets/wallet/add-to-google-wallet.png':null)]);
    const contain=(img,x,y,w,h)=>{const scale=Math.min(w/img.width,h/img.height);const iw=img.width*scale,ih=img.height*scale;c.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);};
    if(logo)contain(logo,65,35,440,90);
    c.fillStyle='#167355';c.font='bold 22px sans-serif';c.fillText(preview?'DESIGN PREVIEW — NOT VALID FOR ENTRY':t.test?'PRIVATE TEST TICKET — NOT PUBLIC ADMISSION':'DIGITAL EVENT TICKET',65,205);
    let y=240;
    if(poster){const h=Math.min(760,1080*poster.height/poster.width);c.fillStyle='#080e12';c.fillRect(0,y,1080,h);contain(poster,0,y,1080,h);y+=h+45;}
    function line(text,font,size,color){c.font=font+' '+size+'px sans-serif';c.fillStyle=color;let row='';for(const char of String(text)){if(c.measureText(row+char).width>940){c.fillText(row,65,y);y+=size*1.35;row=char;}else row+=char;}if(row){c.fillText(row,65,y);y+=size*1.35;}}
    if(promoter||t.organiserName){line('ORGANISED BY','bold',18,'#66716d');if(promoter){contain(promoter,65,y,340,80);y+=95;}if(t.organiserName)line(t.organiserName,'bold',24,'#193228');y+=15;}
    y+=45;line(t.title,'bold',48,'#14291c');y+=12;line(date,'normal',27,'#4b5d4d');line(t.venue,'normal',27,'#4b5d4d');y+=20;
    line(t.holderName||'Ticket holder','bold',34,'#14291c');line(t.tier||'General admission','normal',26,'#4b5d4d');y+=15;line(priceText,'normal',22,'#4b5d4d');if(facts){y+=15;for(const f of facts.split('\n'))line(f,'normal',22,'#4b5d4d');}
    const qr=document.querySelector('#qr canvas')||document.querySelector('#qr img');if(!qr)throw Error('Your QR is not ready yet. Please retry.');
    y+=30;c.imageSmoothingEnabled=false;c.drawImage(qr,300,y,480,480);c.imageSmoothingEnabled=true;y+=530;
    c.fillStyle='#245231';c.font='bold 24px sans-serif';c.textAlign='center';c.fillText('SHOW THIS QR AT THE DOOR',540,y);c.textAlign='left';y+=55;
    if(appleBadge||googleBadge){const badges=[appleBadge,googleBadge].filter(Boolean);for(const [i,badge] of badges.entries())contain(badge,180+i*390,y,330,100);y+=130;c.textAlign='center';c.fillStyle='#4b5d4d';c.font='20px sans-serif';c.fillText('Scan the QR above to open your ticket and add it to your wallet.',540,y);c.textAlign='left';y+=50;}
    line('Ticket reference: '+id,'normal',20,'#4b5d4d');line(t.test?'Private scanner rehearsal only · Keep your QR private':'One valid ticket · One admission · Keep your QR private','normal',20,'#4b5d4d');y+=15;
    line('Transferred, refunded or cancelled tickets are not valid for entry.','normal',18,'#4b5d4d');line('Admission pass only · not a fiscal invoice.','normal',18,'#4b5d4d');line('Full entry conditions: theticketbunker.com/terms','normal',18,'#4b5d4d');y+=25;
    c.fillStyle='#080e12';c.fillRect(0,y,1080,145);c.fillStyle='#fff';c.font='bold 20px sans-serif';c.fillText('Powered by SoundBunker',65,y+38);if(poweredBy)contain(poweredBy,65,y+55,300,44);c.font='17px sans-serif';c.fillText('theticketbunker.com · Manage names and transfers in My tickets',65,y+125);
    const finished=document.createElement('canvas');finished.width=1080;finished.height=y+145;finished.getContext('2d').drawImage(canvas,0,0);
    const blob=await new Promise(resolve=>finished.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not save the ticket image. Use Print / save PDF instead.');
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ticketbunker-'+id.slice(0,8)+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    $('notice').textContent=preview?'Design preview downloaded. Not valid for entry.':'Digital ticket downloaded. Keep it private; this and any printed copy use the same one-admission QR.';
   }catch(error){$('notice').textContent=error.message;}finally{button.disabled=false;}
  };
  $('saveTicket').onclick=()=>{const image=document.querySelector('#qr img'),canvas=document.querySelector('#qr canvas'),href=image?.src||canvas?.toDataURL('image/png');if(!href)return;$('notice').textContent='Keep your saved QR private.';const a=document.createElement('a');a.href=href;a.download='ticketbunker-'+id.slice(0,8)+'.png';a.click();};
 }catch(error){$('name').textContent='Ticket unavailable';$('ticketTierMark').textContent='UNAVAILABLE';$('details').textContent='';$('notice').textContent=error.message;}
})();

