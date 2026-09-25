(()=>{
const track=document.querySelector('#home-merch-track');if(!track)return;
const move=delta=>track.scrollBy({left:delta*Math.max(220,track.clientWidth*.75),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
document.querySelector('#merch-prev').onclick=()=>move(-1);document.querySelector('#merch-next').onclick=()=>move(1);
const load=async()=>{try{
const products=[];let offset=0;const seen=new Set();
while(offset!==null&&!seen.has(offset)){
 seen.add(offset);const response=await fetch('/api/shop?action=featured');
 if(!response.ok)throw Error('Unavailable');const data=await response.json();
 products.push(...data.products.filter(p=>p.image&&p.collection!=='crude-city'));offset=data.next??null;
}
const groups=[[],[],[]];
for(const p of products){const group=/hat|cap/i.test(p.name)?1:/shirt|hoodie|sweatshirt|jacket|vest|shorts|joggers/i.test(p.name)?0:2;groups[group].push(p);}
const mixed=[];while(groups.some(g=>g.length)){for(const g of groups)if(g.length)mixed.push(g.shift());}
if(!mixed.length)return;track.replaceChildren();for(const p of mixed.slice(0,6)){const a=document.createElement('a');a.className='home-merch-card';a.href='shop.html#product-'+p.id;const img=document.createElement('img');img.src=p.image;if(p.campaign)img.className='campaign-image';img.alt=p.name;img.width=400;img.height=500;img.loading='lazy';img.decoding='async';const h=document.createElement('h3');h.textContent=p.display_name||p.name;a.append(img,h);if(Number.isSafeInteger(p.price)){const price=document.createElement('p');price.textContent=new Intl.NumberFormat('en-IE',{style:'currency',currency:'EUR'}).format(p.price/100)+' · VAT included';a.append(price);}track.append(a);}}catch{/* Keep the visible shop link if the provider is unavailable. */}};
if('IntersectionObserver' in window){const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();load();}},{rootMargin:'300px'});observer.observe(track);}else load();
})();
