// "Where the money goes" example for organisers, from the same published plans as checkout.
import {plans,planForCapacity} from './pricing-rules.js';
const $=s=>document.querySelector(s);
const price=$('#calc-price'),qty=$('#calc-qty');
if(price&&qty){
 const eur=c=>new Intl.NumberFormat('en-GB',{style:'currency',currency:'EUR',maximumFractionDigits:c%100?2:0}).format(c/100);
 const update=()=>{
  const p=Number(price.value)*100,n=Number(qty.value),plan=plans[planForCapacity(n)];
  const gross=p*n,stripe=Math.round(n*(p*.015+25)),fee=plan.eur,keep=gross-stripe-fee;
  $('#calc-price-out').textContent=eur(p);$('#calc-qty-out').textContent=n.toLocaleString('en-GB');
  $('#calc-buyer').textContent=eur(p);$('#calc-keep').textContent=eur(Math.round(keep/100)*100);$('#calc-stripe').textContent=eur(Math.round(stripe/100)*100);$('#calc-tb').textContent=eur(fee);$('#calc-plan').textContent=plan.label;
  const pct=v=>Math.max(0,v/gross*100).toFixed(2)+'%';
  $('#bar-keep').style.width=pct(keep);$('#bar-stripe').style.width=pct(stripe);$('#bar-tb').style.width=pct(fee);
  $('#calc-keep').title=Math.round(keep/gross*1000)/10+'% of ticket sales';
 };
 price.oninput=qty.oninput=update;update();
}
