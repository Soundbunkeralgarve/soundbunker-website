(()=>{
 const data=[['standard','SoundBunker Standard','The original studio essentials.'],['slogans','SoundBunker Slogans','Say it with your T-shirt.'],['rave','Rave Collection','Made for the after-hours crowd.'],['kids','SoundBunker Kids','Big personalities. Little music lovers.'],['christmas','Christmas Collection','Festive gifts for music lovers.']];
 const path=location.pathname;const isShop=/shop\.html$/.test(path);
 const host=document.createElement('aside');host.className=isShop?'wrap collection-promos':'merch-mini-promo';host.setAttribute('aria-label','Explore SoundBunker merchandise');
 let entries=data;
 if(!isShop){let index=[...path].reduce((n,c)=>n+c.charCodeAt(0),0)%data.length;if(/academy|parties|education/.test(path))index=3;if(/production|mixing/.test(path))index=2;entries=[data[index]];}
 for(const [key,title,copy] of entries){const a=document.createElement('a');a.className='collection-promo';a.href='shop.html?collection='+key+'#collection';const image=document.createElement('img');image.src='/assets/shop/collections/'+key+'.webp';image.alt=title;image.loading='lazy';image.decoding='async';image.width=450;image.height=260;const text=document.createElement('div');const heading=document.createElement('strong');heading.textContent=title;const desc=document.createElement('span');desc.textContent=copy;const cta=document.createElement('span');cta.textContent='Shop collection →';text.append(heading,desc,cta);a.append(image,text);host.append(a);}
 const main=document.querySelector('main');if(isShop){document.querySelector('.shop-strip').after(host);}else if(main){main.append(host);}else{document.querySelector('footer')?.before(host);}
})();
