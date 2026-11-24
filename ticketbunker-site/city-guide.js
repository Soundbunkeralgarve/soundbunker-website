const status=document.querySelector('[data-guide-share-status]');
const url=document.querySelector('link[rel="canonical"]')?.href || location.href;
const copy=async()=>{try{await navigator.clipboard.writeText(url);status.textContent='Guide link copied.';}catch{status.textContent='Copy this guide link: '+url;}};
const print=document.querySelector('[data-guide-print]');if(print)print.onclick=()=>window.print();
const copyButton=document.querySelector('[data-guide-copy]');if(copyButton)copyButton.onclick=copy;
const share=document.querySelector('[data-guide-share]');if(share)share.onclick=async()=>{try{if(navigator.share)await navigator.share({title:document.title,text:'Plan your next city trip with TicketBunker',url});else await copy();}catch(e){if(e.name!=='AbortError')await copy();}};
const finder=document.querySelector('[data-guide-finder]');
if(finder)finder.oninput=()=>{const term=finder.value.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().trim();for(const a of document.querySelectorAll('[data-city-guide]'))a.hidden=!a.textContent.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().includes(term);};
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
