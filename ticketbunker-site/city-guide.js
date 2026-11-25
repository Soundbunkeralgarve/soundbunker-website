const status=document.querySelector('[data-guide-share-status]');
const url=document.querySelector('link[rel="canonical"]')?.href || location.href;
const copy=async()=>{try{await navigator.clipboard.writeText(url);status.textContent='Guide link copied.';}catch{status.textContent='Copy this guide link: '+url;}};
const print=document.querySelector('[data-guide-print]');if(print)print.onclick=()=>window.print();
const copyButton=document.querySelector('[data-guide-copy]');if(copyButton)copyButton.onclick=copy;
const share=document.querySelector('[data-guide-share]');if(share)share.onclick=async()=>{try{if(navigator.share)await navigator.share({title:document.title,text:'Plan your next city trip with TicketBunker',url});else await copy();}catch(e){if(e.name!=='AbortError')await copy();}};
const finder=document.querySelector('[data-guide-finder]');
// Directory: search by name or country, or pick a country chip; empty groups hide.
const plainText=v=>String(v||'').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim();
let ccFilter='';
const applyDirectory=()=>{const term=plainText(finder?.value);const popular=document.querySelector('[data-cgd-popular]');
 if(popular)popular.hidden=Boolean(term||ccFilter);
 let shown=0;for(const g of document.querySelectorAll('[data-cgd-group]')){let n=0;
  for(const a of g.querySelectorAll('[data-city-guide]')){const ok=(!ccFilter||a.dataset.cc===ccFilter)&&(!term||plainText(a.textContent).includes(term));a.hidden=!ok;if(ok)n++;}
  g.hidden=!n;shown+=n;}
 const none=document.querySelector('[data-cgd-none]');if(none)none.hidden=shown>0;};
if(finder)finder.oninput=applyDirectory;
for(const b of document.querySelectorAll('[data-cc-filter]'))b.onclick=()=>{ccFilter=b.dataset.ccFilter;for(const x of document.querySelectorAll('[data-cc-filter]'))x.setAttribute('aria-pressed',String(x===b));applyDirectory();};
// Dining deals: show live food offers from joined Awin advertisers when there are any.
// Nothing is shown (the fallback panel stays) when the feed is empty or unavailable.
const offerBox=document.querySelector('[data-guide-offers]');
if(offerBox){
  const country=offerBox.dataset.guideOffers;
  fetch('/api/partner-offers?country='+encodeURIComponent(country)).then(r=>r.ok?r.json():{offers:[]}).then(({offers=[]})=>{
    const food=offers.filter(o=>o.kind==='food'&&/^https:\/\//.test(o.url)).slice(0,3);
    if(!food.length)return;
    const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;};
    for(const o of food.reverse()){
      const card=el('article','cg-coupon cg-coupon-live'),stub=el('div','cg-stub'),body=el('div','cg-coupon-body');
      stub.append(el('b','', 'EAT'),el('span','','DEALS'));
      body.append(el('span','cg-type',(o.code?'Voucher code':'Partner offer')+' · '+o.advertiser),el('h3','',o.title));
      if(o.description)body.append(el('p','',o.description));
      if(o.code){const p=el('p','','Code: ');p.append(el('strong','cg-code',o.code));body.append(p);}
      const a=el('a','',o.code?'Use this code at '+o.advertiser:'Open this offer');a.href=o.url;a.target='_blank';a.rel='sponsored noopener noreferrer';
      const p=el('p');p.append(a);body.append(p);
      body.append(el('p','cg-note',[o.terms||'See the provider’s terms before booking.',o.ends?'Ends '+o.ends+'.':''].join(' ')));
      card.append(stub,body);offerBox.prepend(card);
    }
  }).catch(()=>{});
}
const pdfLink=document.querySelector('[data-guide-pdf]');
if(pdfLink&&status)pdfLink.addEventListener('click',()=>{status.textContent='Preparing your PDF guide…';setTimeout(()=>{status.textContent='';},6000);});
// Highlight the section being read without moving the document back to its menu.
const jumpBar=document.querySelector('.cg-jumps-bar');
if(jumpBar){
 const measureJumps=()=>document.documentElement.style.setProperty('--tb-guide-nav-height',Math.ceil(jumpBar.getBoundingClientRect().height)+'px');
 measureJumps();
 if('ResizeObserver' in window)new ResizeObserver(measureJumps).observe(jumpBar);
}
const jumpLinks=[...document.querySelectorAll('.cg-jumps a[href^="#"]')];
const activateJump=active=>{
 for(const a of jumpLinks){
  const on=a===active;a.classList.toggle('active',on);
  if(on)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');
 }
 const track=active?.closest('.cg-jumps');
 if(!track)return;
 const linkRect=active.getBoundingClientRect(),trackRect=track.getBoundingClientRect();
 if(linkRect.left>=trackRect.left+4&&linkRect.right<=trackRect.right-4)return;
 const left=linkRect.left-trackRect.left+track.scrollLeft-(track.clientWidth-linkRect.width)/2;
 track.scrollTo({left:Math.max(0,Math.min(track.scrollWidth-track.clientWidth,left)),behavior:'auto'});
};
for(const a of jumpLinks)a.addEventListener('click',()=>activateJump(a));
if(jumpLinks.length&&'IntersectionObserver' in window){
 const byId=new Map(jumpLinks.map(a=>[a.getAttribute('href').slice(1),a]));
 const io=new IntersectionObserver(es=>{for(const e of es)if(e.isIntersecting)activateJump(byId.get(e.target.id));},{rootMargin:'-35% 0px -60% 0px'});
 for(const id of byId.keys()){const section=document.getElementById(id);if(section)io.observe(section);}
}
