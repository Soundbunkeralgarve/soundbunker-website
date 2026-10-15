(async()=>{
 const $=id=>document.getElementById(id),p=new URLSearchParams(location.search),id=p.get('id'),sig=p.get('sig');
 if(!id||!sig){$('name').textContent='Ticket link incomplete';$('notice').textContent='Open the secure ticket link from My tickets.';return;}
 try{
  const response=await fetch('/api/event-ticket?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig),{cache:'no-store'});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Ticket unavailable');const t=data.ticket;
  if(t.test&&!t.walletTest)throw Error('This ticket is not valid for admission.');
  $('name').textContent=t.title;$('ticketTierMark').textContent=t.tier||'GENERAL ADMISSION';$('ticketHolder').textContent=t.holderName||'Ticket holder';$('ticketNumber').textContent=t.admissionNumber?String(t.admissionNumber).padStart(2,'0'):'—';$('ticketReference').textContent='Ticket reference · '+id;
  const date=new Intl.DateTimeFormat('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:t.timezone||'Europe/Lisbon'}).format(new Date(t.date));
  $('details').textContent=date+' · venue local time · '+t.venue;
  if(t.test)document.querySelector('.ticket-masthead span').textContent='PRIVATE TEST TICKET';
  if(t.test)$('notice').textContent='PRIVATE WALLET & SCANNER TEST · €0 · Not valid for admission to a public event.';
  if(t.poster&&/^https:\/\//i.test(t.poster)){const img=document.createElement('img');img.src=t.poster;img.alt='Official event artwork';$('ticketArtwork').append(img);}
  if(t.eventLogo&&/^https:\/\//i.test(t.eventLogo)){const img=document.createElement('img');img.src=t.eventLogo;img.alt='Organiser logo';$('organiserLogo').append(img);$('ticketOrganiser').hidden=false;}
  if(t.used){$('ticketTierMark').textContent='ALREADY CHECKED IN';$('notice').textContent='This ticket has already been used for admission.';return;}
  if(typeof QRCode!=='function')throw Error('QR could not be generated. Refresh this page or ask the door team for help.');
  const ticketUrl=location.origin+'/event-ticket?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig);
  new QRCode($('qr'),{text:ticketUrl,width:232,height:232,correctLevel:QRCode.CorrectLevel.M});
  $('ticketActions').hidden=false;
  $('walletActions').hidden=!(t.wallet?.apple||t.wallet?.google);
  const walletEndpoint='/api/event-wallet?id='+encodeURIComponent(id)+'&sig='+encodeURIComponent(sig);
  if(t.wallet?.apple){$('appleWallet').href=walletEndpoint+'&provider=apple';$('appleWallet').hidden=false;}
  if(t.wallet?.google){$('googleWallet').hidden=false;$('googleWallet').onclick=async()=>{
   const button=$('googleWallet');button.disabled=true;
   try{const response=await fetch(walletEndpoint+'&provider=google',{cache:'no-store'});const result=await response.json();if(!response.ok)throw Error(result.error||'Wallet unavailable');if(!result.url?.startsWith('https://pay.google.com/gp/v/save/'))throw Error('Invalid wallet link');location.assign(result.url);}catch(error){$('notice').textContent=error.message;}finally{button.disabled=false;}
  };}
$('printTicket').onclick=()=>window.print();
  $('saveDigitalTicket').onclick=async()=>{
   const button=$('saveDigitalTicket');button.disabled=true;
   try{
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=4000;const c=canvas.getContext('2d');
    c.fillStyle='#fff';c.fillRect(0,0,1080,4000);c.fillStyle='#000';c.fillRect(0,0,1080,165);
    const image=async src=>new Promise(resolve=>{if(!src){resolve(null);return;}const img=new Image();img.crossOrigin='anonymous';const timer=setTimeout(()=>resolve(null),5000);img.onload=()=>{clearTimeout(timer);resolve(img)};img.onerror=()=>{clearTimeout(timer);resolve(null)};img.src=src;});
    const [logo,poster,promoter,poweredBy]=await Promise.all([image('/brand-compact.png'),image(/^https:\/\//i.test(t.poster||'')?t.poster:null),image(/^https:\/\//i.test(t.eventLogo||'')?t.eventLogo:null),image('/soundbunker-logo-white.png')]);
    const contain=(img,x,y,w,h)=>{const scale=Math.min(w/img.width,h/img.height);const iw=img.width*scale,ih=img.height*scale;c.drawImage(img,x+(w-iw)/2,y+(h-ih)/2,iw,ih);};
    if(logo)contain(logo,65,35,440,90);
    c.fillStyle='#167355';c.font='bold 22px sans-serif';c.fillText(t.test?'PRIVATE TEST TICKET — NOT PUBLIC ADMISSION':'DIGITAL EVENT TICKET',65,205);
    let y=240;
    if(poster){const h=Math.min(760,1080*poster.height/poster.width);c.fillStyle='#080e12';c.fillRect(0,y,1080,h);contain(poster,0,y,1080,h);y+=h+45;}
    if(promoter){c.fillStyle='#fff';c.fillRect(0,y,1080,110);c.fillStyle='#66716d';c.font='bold 18px sans-serif';c.fillText('ORGANISED BY',65,y+44);contain(promoter,330,y,340,80);y+=110;}
    function line(text,font,size,color){c.font=font+' '+size+'px sans-serif';c.fillStyle=color;let row='';for(const char of String(text)){if(c.measureText(row+char).width>940){c.fillText(row,65,y);y+=size*1.35;row=char;}else row+=char;}if(row){c.fillText(row,65,y);y+=size*1.35;}}
    y+=45;line(t.title,'bold',48,'#14291c');y+=12;line(date,'normal',27,'#4b5d4d');line(t.venue,'normal',27,'#4b5d4d');y+=20;
    line(t.holderName||'Ticket holder','bold',34,'#14291c');line(t.tier||'General admission','normal',26,'#4b5d4d');
    const qr=document.querySelector('#qr canvas')||document.querySelector('#qr img');if(!qr)throw Error('Your QR is not ready yet. Please retry.');
    y+=30;c.imageSmoothingEnabled=false;c.drawImage(qr,300,y,480,480);c.imageSmoothingEnabled=true;y+=530;
    c.fillStyle='#245231';c.font='bold 24px sans-serif';c.textAlign='center';c.fillText('SHOW THIS QR AT THE DOOR',540,y);c.textAlign='left';y+=55;
    line('Ticket reference: '+id,'normal',20,'#4b5d4d');line(t.test?'Private scanner rehearsal only · Keep your QR private':'One valid ticket · One admission · Keep your QR private','normal',20,'#4b5d4d');y+=15;
    line('Transferred, refunded or cancelled tickets are not valid for entry.','normal',18,'#4b5d4d');line('Full entry conditions: theticketbunker.com/terms','normal',18,'#4b5d4d');y+=25;
    c.fillStyle='#080e12';c.fillRect(0,y,1080,105);c.fillStyle='#fff';c.font='bold 18px sans-serif';c.fillText('POWERED BY',65,y+40);if(poweredBy)contain(poweredBy,225,y+12,300,44);c.font='17px sans-serif';c.fillText('Manage names and transfers in My tickets · theticketbunker.com',65,y+76);
    const finished=document.createElement('canvas');finished.width=1080;finished.height=y+105;finished.getContext('2d').drawImage(canvas,0,0);
    const blob=await new Promise(resolve=>finished.toBlob(resolve,'image/png'));if(!blob)throw Error('Could not save the ticket image. Use Print / save PDF instead.');
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ticketbunker-'+id.slice(0,8)+'.png';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    $('notice').textContent='Digital ticket downloaded. Keep it private; this and any printed copy use the same one-admission QR.';
   }catch(error){$('notice').textContent=error.message;}finally{button.disabled=false;}
  };
  $('saveTicket').onclick=()=>{const image=document.querySelector('#qr img'),canvas=document.querySelector('#qr canvas'),href=image?.src||canvas?.toDataURL('image/png');if(!href)return;$('notice').textContent='Keep your saved QR private.';const a=document.createElement('a');a.href=href;a.download='ticketbunker-'+id.slice(0,8)+'.png';a.click();};
 }catch(error){$('name').textContent='Ticket unavailable';$('ticketTierMark').textContent='UNAVAILABLE';$('details').textContent='';$('notice').textContent=error.message;}
})();

