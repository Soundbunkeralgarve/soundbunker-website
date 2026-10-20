import {plans} from './pricing-rules.js';
import {money} from './shared.js';
const bands=['Up to 100 tickets','101–500 tickets','501–1,000 tickets','1,001–2,000 tickets'];
document.querySelector('#organiser-rates').innerHTML=Object.values(plans).map((p,i)=>`<div><span>${bands[i]}</span><strong>${money(p.eur)}</strong></div>`).join('');
// Download opens only when this exact app has a verified public store listing.
(async()=>{try{
 const res=await fetch('/api/scanner-store',{signal:AbortSignal.timeout(10000)});if(!res.ok)return;
 const d=await res.json();if(!d.live||!d.url)return;const u=new URL(d.url);if(u.protocol!=='https:'||u.hostname!=='apps.apple.com')return;
 const pending=document.querySelector('#scanner-store-button');if(!pending)return;
 const link=document.createElement('a');link.href=u.href;link.className='scanner-store-live';link.setAttribute('aria-label','Download TicketBunker Scanner on the App Store');link.replaceChildren(...pending.childNodes);pending.replaceWith(link);
 document.querySelector('#scanner-store-status').textContent='Available now on the App Store';
 document.querySelector('#scanner-description').textContent='Give authorised door staff one clear way to scan tickets, recognise duplicate codes and check guests in. TicketBunker Scanner for iPhone.';
}catch{}})();
