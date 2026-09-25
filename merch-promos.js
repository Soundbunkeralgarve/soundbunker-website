(()=>{
 const data=[['standard','SoundBunker Standard','The original studio essentials.'],['slogans','SoundBunker Slogans','Say it with your T-shirt.'],['rave','Rave Collection','Made for the after-hours crowd.'],['kids','SoundBunker Kids','Big personalities. Little music lovers.'],['christmas','Christmas Collection','Festive gifts for music lovers.']];
 const path=location.pathname;if(path==='/'||/index\.html$/.test(path))return;const isShop=/shop\.html$/.test(path);const isFamilyPage=/academy|parties|education|kids|gift-vouchers|redeem/i.test(path);const isClient=/\/client(?:\.html)?\/?$/.test(path);
 const host=document.createElement('aside');host.className=isShop?'wrap collection-promos':'merch-mini-promo';host.setAttribute('aria-label','Explore SoundBunker merchandise');
 let entries=isShop?[...data,['crude-city','Crude City · 18+','Festival & ravewear. Adults only.']]:data;
 if(!isShop){let index=[...path].reduce((n,c)=>n+c.charCodeAt(0),0)%data.length;if(isClient)index=0;if(isFamilyPage)index=3;if(/production|mixing/.test(path))index=2;entries=[data[index]];if(!isFamilyPage&&!isClient)entries.push(['crude-city','Crude City · 18+','Festival & ravewear. Adults only.']);}
 for(const [key,title,copy] of entries){
  const a=document.createElement('a');a.className='collection-promo'+(key==='crude-city'?' crude-promo':'');
  a.href=key==='crude-city'?'https://crude-city.com/':'shop.html?collection='+encodeURIComponent(key)+'#collection';
  if(key==='crude-city')a.setAttribute('aria-label','Crude City adult-only collection. Confirm you are 18 or over before viewing products.');
  const image=document.createElement('img');image.src=key==='crude-city'?'/assets/shop/collections/crude-city-promo.webp':'/assets/shop/collections/'+key+'.webp';
  image.alt=key==='crude-city'?'Branded Crude City purple underground city skyline advert, without explicit product images.':title;
  image.loading='lazy';image.decoding='async';image.width=450;image.height=key==='crude-city'?251:260;
  const info=document.createElement('div');info.className='collection-promo-copy';
  if(key==='crude-city'){const age=document.createElement('strong');age.className='crude-age-badge';age.textContent='18+ ONLY';const cta=document.createElement('span');cta.textContent='Enter Crude City →';info.append(age,cta);}
  else{const heading=document.createElement('strong');heading.textContent=title;const desc=document.createElement('span');desc.textContent=copy;const cta=document.createElement('span');cta.textContent='Shop collection →';info.append(heading,desc,cta);}
  a.append(image,info);host.append(a);
 }
 if(/\/client(?:\.html)?\/?$/.test(path)){
 document.querySelector('.client-auth-form-wrap')?.append(host);
 const portalAd=host.cloneNode(true);const a=portalAd.querySelector('a');a.href='shop.html?collection=rave#collection';a.querySelector('img').src='/assets/shop/collections/rave.webp';a.querySelector('img').alt='Rave Collection';a.querySelector('strong').textContent='Rave Collection';a.querySelector('span').textContent='Studio finished. Next stop: the dance floor.';document.getElementById('manage-sessions')?.before(portalAd);
 const giftAd=host.cloneNode(true);const g=giftAd.querySelector('a');g.href='shop.html?collection=christmas#collection';g.querySelector('img').src='/assets/shop/collections/christmas.webp';g.querySelector('img').alt='Christmas Collection';g.querySelector('strong').textContent='Christmas Collection';g.querySelector('span').textContent='Festive gifts for music lovers.';document.getElementById('my-vouchers')?.before(giftAd);return;
 }
 const main=document.querySelector('main');if(isShop){document.querySelector('.shop-strip').after(host);}else if(main){main.append(host);}else{document.querySelector('footer')?.before(host);}
})();
