import {plans,largeEventDeposit,additionalTicketRate} from './pricing-rules.js';
const currencySelect=document.querySelector('#organiser-currency');
const bands=['Up to 100 tickets','101–500 tickets','501–1,000 tickets','1,001–2,000 tickets'];
function price(cents,currency){return new Intl.NumberFormat('en-GB',{style:'currency',currency:currency.toUpperCase(),minimumFractionDigits:cents%100?2:0,maximumFractionDigits:2}).format(cents/100);}
function renderRates(){
 const currency=currencySelect?.value==='gbp'?'gbp':'eur',rates=document.querySelector('#organiser-rates');
 if(!rates)return;
 rates.replaceChildren(...Object.values(plans).map((plan,i)=>{
  const card=document.createElement('article'),band=document.createElement('span'),amount=document.createElement('strong'),note=document.createElement('small');
  band.textContent=bands[i];amount.textContent=price(plan[currency],currency);note.textContent='per event · VAT included';card.append(band,amount,note);return card;
 }));
 document.querySelector('#organiser-deposit').textContent=price(largeEventDeposit[currency],currency);
 document.querySelector('#organiser-extra-rate').textContent=price(additionalTicketRate(currency),currency);
}
currencySelect?.addEventListener('change',renderRates);renderRates();
// A public App Store link appears only after the existing server verifies the listing.
(async()=>{try{
 const response=await fetch('/api/scanner-store',{credentials:'omit',signal:AbortSignal.timeout(10000)});
 if(!response.ok)return;
 const release=await response.json();if(release.live!==true||!release.url)return;
 const url=new URL(release.url);if(url.protocol!=='https:'||url.hostname!=='apps.apple.com')return;
 const link=document.querySelector('#organiser-store-link');if(!link)return;
 link.href=url.href;link.hidden=false;
 document.querySelector('#organiser-store-status').textContent='iPhone / iPad: available on the App Store. Android test APK: Organiser Portal → App Downloads. Google Play listing is not yet available.';
}catch{ /* Keep the accurate pending state if a listing cannot be verified. */ }})();
