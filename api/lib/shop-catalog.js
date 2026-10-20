import { shirtPairs } from './printful-shop.js';
import { shopSizeLabel, kidsAge } from './shop-sizes.js';
// Black and white supplier listings for the same slogan share a single card.
// The existing product endpoint returns both sets of real purchasable variants.
export function browseCatalog(products) {
  const merged = new Map();
  for (const product of products) {
    if (product.collection === 'crude-city') continue;
    const pair = shirtPairs.find(ids => ids.includes(Number(product.id)));
    const key = pair ? pair[0] : product.id;
    const previous = merged.get(key);
    const row = { ...product, id:key, source_ids:[product.id] };
    if (previous) {
      const primary = Number(product.id) === key ? row : previous;
      const secondary = primary === row ? previous : row;
      merged.set(key,{...primary,
        source_ids:[...new Set([...previous.source_ids,product.id])],
        colors:[...new Set([...primary.colors,...secondary.colors])],
        sizes:[...new Set([...primary.sizes,...secondary.sizes])],
        images:[...new Set([...primary.images,...secondary.images])],
        views:[...new Map([...primary.views,...secondary.views].map(view=>[view.url,view])).values()]
      });
    } else merged.set(key,row);
  }
  const featured=[422179281,475033196,475185407,475184250,475185759,413283381,475033389,475185188];
  const collections=['standard','slogans','rave','kids','christmas'];
  return [...merged.values()].sort((a,b)=>{
    const rank = product => featured.includes(product.id) ? featured.indexOf(product.id) : featured.length + collections.indexOf(product.collection);
    return rank(a)-rank(b);
  }).map(product=>({...product,size_options:product.sizes.map(size=>({size,label:shopSizeLabel(product.name,size),age:kidsAge(product.name,size)}))}));
}
