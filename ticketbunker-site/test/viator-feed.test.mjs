import test from 'node:test';
import assert from 'node:assert/strict';
import {viatorItem, loadViator, pickListings, VIATOR_PLACES, feedCacheDuration} from '../api/partner-feed.js';
import {blend, filterItems, cityMatches} from '../discovery-model.js';

const product = (over = {}) => ({
  productCode: '12345P1', title: 'Benagil Caves Boat Tour from Portimão',
  productUrl: 'https://www.viator.com/tours/Algarve/Benagil/d4123-12345P1?pid=P00333211&mcid=42383&medium=api',
  images: [{isCover: true, variants: [{width: 200, height: 150, url: 'https://media.tacdn.com/a-200.jpg'}, {width: 720, height: 480, url: 'https://media.tacdn.com/a-720.jpg'}]}],
  pricing: {summary: {fromPrice: 32.5}, currency: 'EUR'}, reviews: {totalReviews: 900, combinedAverageRating: 4.8}, ...over
});

test('Viator products become open-dated, tracked partner listings', () => {
  const item = viatorItem(product(), {place: 'Algarve', countryCode: 'PT'});
  assert.equal(item.category, 'boat');
  assert.equal(item.seller, 'Viator');
  assert.equal(item.startsAt, '');
  assert.equal(item.priceCents, 3250);
  assert.equal(item.image, 'https://media.tacdn.com/a-720.jpg');
  assert.equal(new URL(item.url).searchParams.get('pid'), 'P00333211');
  assert.equal(viatorItem(product({title: 'Lisbon Food & Wine Walking Tour'}), {place: 'Lisbon', countryCode: 'PT'}).category, 'daysout');
});

test('off-site or broken Viator products are dropped', () => {
  assert.equal(viatorItem(product({productUrl: 'https://evil.example/x'}), {place: 'Algarve', countryCode: 'PT'}), null);
  assert.equal(viatorItem(product({productUrl: 'http://www.viator.com/x'}), {place: 'Algarve', countryCode: 'PT'}), null);
  assert.equal(viatorItem(product({title: ''}), {place: 'Algarve', countryCode: 'PT'}), null);
});

test('Viator stays off without a key and searches verified destinations directly with bounded concurrency', async () => {
  let calls = 0;
  assert.deepEqual(await loadViator({}, {fetcher: async () => { calls++; }}), []);
  assert.equal(calls, 0);
  const seen = []; let active = 0, maxActive = 0;
  const fetcher = async (url, opts) => {
    const body = JSON.parse(opts.body);
    seen.push({url, opts, body});
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    const limo = url.endsWith('/search/freetext'), id = limo ? body.productFiltering.destination : body.filtering.destination;
    return {ok: true, json: async () => ({products: limo ? {results: [product({productCode: 'L' + id, title:'Private limousine transfer'})]} : [product({productCode: 'P' + id})]})};
  };
  const timeout=AbortSignal.timeout, budgets=new WeakMap();
  AbortSignal.timeout=ms=>{const signal=timeout(ms);budgets.set(signal,ms);return signal;};
  let items;try{items=await loadViator({VIATOR_API_KEY: ' fixture-token\n'}, {fetcher});}finally{AbortSignal.timeout=timeout;}
  assert.equal(items.length, 2 * VIATOR_PLACES.length);
  assert.equal(seen.length, 41, 'general/limo searches plus eleven focused admission/transport targets, no taxonomy or sandbox probes');
  assert.equal(seen.filter(({url}) => url === 'https://api.viator.com/partner/products/search').length, 15);
  assert.equal(seen.filter(({url}) => url === 'https://api.viator.com/partner/search/freetext').length, 26);
  assert.ok(seen.every(({opts, body}) => opts.method === 'POST' && opts.headers['exp-api-key'] === 'fixture-token' && body.currency === 'EUR'));
  for (const {url, body} of seen) {
    if (url.endsWith('/search/freetext')) {
      assert.ok(['limousine','London Zoo Entry Ticket','Lisbon Oceanarium Entrance Ticket','Lisbon Banksy Museum Admission Ticket','Private Rijksmuseum Guided Tour',
        'Hola Barcelona Public Transportation Travel Card','Lisbon City Card','Uber Boat River Roamer','Venice Marco Polo Airport Shared Water Taxi Arrival Transfer',
        'Venice Shared Water Taxi Departure Transfer','Heathrow Express Train Ticket','Venice Marco Polo Airport Direct Bus'].includes(body.searchTerm));
      assert.deepEqual(body.searchTypes,[{searchType:'PRODUCTS',pagination:{start:1,count:body.searchTerm==='limousine'?10:30}}]);
    } else assert.equal(body.pagination.count,30);
  }
  assert.equal(maxActive, 4, 'concurrent searches stay bounded');
  let worst=0;for(let n=0;n<seen.length;n+=4)worst+=Math.max(...seen.slice(n,n+4).map(({opts})=>budgets.get(opts.signal)));
  assert.equal(worst,49000,'request timeout batches stay below the 55-second client and 60-second function limits');
  assert.ok(seen.every(({opts})=>opts.headers.Accept==='application/json;version=2.0'&&opts.headers['Accept-Language']==='en-GB'));
  assert.ok(seen.slice(-11).every(({opts})=>budgets.get(opts.signal)===3000));
  const expected = {Algarve:['PT','774'], Lisbon:['PT','538'], Porto:['PT','26879'], Madeira:['PT','5392'], Barcelona:['ES','562'], Madrid:['ES','566'], Seville:['ES','556'], Malaga:['ES','956'], Ibiza:['ES','4217'], Paris:['FR','479'], Amsterdam:['NL','525'], Rome:['IT','511'], Dublin:['IE','503'], London:['GB','737'], Edinburgh:['GB','739']};
  for (const [city, [countryCode, id]] of Object.entries(expected)) {
    const item = items.find(i => i.city === city && i.id === 'viator:P' + id);
    assert.equal(item?.id, 'viator:P' + id, city + ' uses its verified destination ID');
    assert.equal(item.countryCode, countryCode);
    const limo = items.find(i => i.id === 'viator:L' + id);
    assert.equal(limo.city,city); assert.equal(limo.countryCode,countryCode); assert.equal(limo.category,'transfer');
  }
});

test('Viator keeps successful destinations when one product search is rate limited', async () => {
  const items = await loadViator({VIATOR_API_KEY:'fixture-token'}, {fetcher:async (url, opts) => {
    if (url.endsWith('/search/freetext')) return {ok:true, json:async () => ({products:{results:[]}})};
    const id = JSON.parse(opts.body).filtering.destination;
    if (id === '774') return {ok:false, status:429};
    return {ok:true, json:async () => ({products:[product({productCode:'P' + id})]})};
  }});
  assert.equal(items.length, 14);
  assert.ok(!items.some(i => i.city === 'Algarve'));
  assert.ok(items.some(i => i.city === 'Lisbon'));
  assert.ok(items.every(i => new URL(i.url).searchParams.get('pid') === 'P00333211'), 'provider tracking remains intact');
});

test('a failed general city search with successful limo results retries the partial catalogue after five minutes', async () => {
  let failLisbon = true;
  const fetcher = async (url, opts) => {
    const body = JSON.parse(opts.body), textSearch = url.endsWith('/search/freetext');
    const id = textSearch ? body.productFiltering.destination : body.filtering.destination;
    if (!textSearch && id === '538' && failLisbon) return {ok:false, status:503};
    const products = textSearch
      ? id === '538' && body.searchTerm === 'limousine' ? [product({productCode:'LisbonAirport', title:'Lisbon private airport transfer'})] : []
      : [product({productCode:'P' + id})];
    return {ok:true, json:async () => ({products:textSearch ? {results:products} : products})};
  };
  const partial = await loadViator({VIATOR_API_KEY:'fixture-token'}, {fetcher});
  assert.deepEqual(partial.filter(i => i.city === 'Lisbon').map(i => i.id), ['viator:LisbonAirport']);
  assert.equal(partial.partialFailure, true);
  assert.equal(Object.getOwnPropertyDescriptor(partial, 'partialFailure').enumerable, false);
  assert.ok(!JSON.stringify(partial).includes('partialFailure'), 'internal retry metadata does not change the public products');
  const fulfilled = value => [{status:'fulfilled', value:[]}, {status:'fulfilled', value}, {status:'fulfilled', value:[]}];
  assert.equal(feedCacheDuration(fulfilled(partial)), 5 * 60 * 1000, 'fulfilled but incomplete supply must not be cached for thirty minutes');
  failLisbon = false;
  const recovered = await loadViator({VIATOR_API_KEY:'fixture-token'}, {fetcher});
  assert.ok(recovered.some(i => i.id === 'viator:P538'));
  assert.equal(recovered.partialFailure, undefined);
  assert.equal(feedCacheDuration(fulfilled(recovered)), 30 * 60 * 1000, 'successful full refresh restores the normal cache');
});

test('Viator rejects a fully failed provider instead of reporting an empty successful catalogue', async () => {
  let calls = 0;
  await assert.rejects(loadViator({VIATOR_API_KEY:'fixture-token'}, {fetcher:async () => {calls++; return {ok:false, status:401};}}),
    /^Error: All Viator searches failed: Viator search 401 for Algarve$/);
  assert.equal(calls, 41, 'failed searches do not trigger taxonomy or sandbox probes');
});

test('limo results keep only explicit relevant transport, deduplicate products and preserve exact provider URLs',async()=>{
  const exactUrl='https://www.viator.com/tours/London/Private-limousine/d737-L1?pid=P00333211&mcid=42383&medium=api&campaign=transport';
  const items=await loadViator({VIATOR_API_KEY:'fixture-token'},{fetcher:async(url,opts)=>{
    const body=JSON.parse(opts.body), id=body.productFiltering?.destination || body.filtering?.destination;
    if(id!=='737')return {ok:true,json:async()=>({products:url.endsWith('/search/freetext')?{results:[]}:[]})};
    const limo=product({productCode:'L1',title:'London private limousine transfer',productUrl:exactUrl});
    return {ok:true,json:async()=>({products:url.endsWith('/search/freetext')?{results:[limo,product({productCode:'L2',title:'Private Airport Transfer from Heathrow'}),product({productCode:'bad',title:'London food and wine walking tour'}),product({productCode:'also-bad',title:'Lisbon walking tour including private airport transfer'})]}:[limo]})};
  }});
  assert.deepEqual(items.map(i=>i.id),['viator:L1','viator:L2']);
  assert.equal(items[0].url,exactUrl);
  assert.ok(items.every(i=>i.city==='London'&&i.countryCode==='GB'&&i.category==='transfer'));
});

test('limo search failures leave the successful general catalogue available',async()=>{
  const items=await loadViator({VIATOR_API_KEY:'fixture-token'},{fetcher:async(url,opts)=>{
    if(url.endsWith('/search/freetext'))return {ok:false,status:503};
    return {ok:true,json:async()=>({products:[product({productCode:'P'+JSON.parse(opts.body).filtering.destination})]})};
  }});
  assert.equal(items.length,15);
});

test('empty limo results cannot hide a failed general provider search',async()=>{
  await assert.rejects(loadViator({VIATOR_API_KEY:'fixture-token'},{fetcher:async(url)=>url.endsWith('/search/freetext')
    ?{ok:true,json:async()=>({products:{results:[]}})}:{ok:false,status:503}}),/Viator searches returned no products after failures: Viator search 503 for Algarve/);
});

test('open-dated trips blend in, match Algarve towns and are not crowded out by dated events', () => {
  const trip = viatorItem(product(), {place: 'Algarve', countryCode: 'PT'});
  const items = blend([], [], Date.now(), [trip]);
  assert.equal(items.length, 1);
  assert.equal(filterItems(items, {city: 'Lagos', category: 'boat'}).length, 1);
  assert.ok(cityMatches('Algarve', 'Portimão'));
  assert.equal(pickListings([trip], {city: 'lagos'}).length, 1);
});


test('focused attractions accept exact live product codes, preserve tour types and deduplicate general results',async()=>{
 const targets=[
  ['London Zoo Entry Ticket','737','2676ZOO','London Zoo Entry Ticket','London','GB','family'],
  ['Lisbon Oceanarium Entrance Ticket','538','111503P1','Lisbon Oceanarium Entrance Ticket','Lisbon','PT','family'],
  ['Lisbon Banksy Museum Admission Ticket','538','420484P3','Lisbon Banksy Museum Admission Ticket','Lisbon','PT','daysout'],
  ['Private Rijksmuseum Guided Tour','525','8718P33','Private Rijksmuseum Guided Tour with Entry','Amsterdam','NL','daysout']
 ];
 const live=([,,code,title])=>product({productCode:code,title,productUrl:'https://www.viator.com/tours/Exact/d1-'+code+'?pid=P00333211&mcid=42383&medium=api',pricing:{summary:{fromPrice:47.25},currency:'EUR'}});
 const requests=[];
 const items=await loadViator({VIATOR_API_KEY:'fixture-token'},{fetcher:async(url,opts)=>{
  const body=JSON.parse(opts.body),target=targets.find(([query])=>query===body.searchTerm);
  if(target){requests.push(body);assert.equal(body.productFiltering.destination,target[1]);return {ok:true,json:async()=>({products:{results:[product({productCode:target[2]+'OTHER',title:target[3]}),live(target)]}})};}
  return {ok:true,json:async()=>({products:url.endsWith('/search/freetext')?{results:[]}:body.filtering.destination==='737'?[live(targets[0])]:[]})};
 }});
 assert.equal(requests.length,4);assert.equal(items.length,4);
 for(const target of targets){const item=items.find(i=>i.id==='viator:'+target[2]);assert.ok(item);assert.equal(item.title,target[3]);assert.equal(item.city,target[4]);assert.equal(item.countryCode,target[5]);assert.equal(item.category,target[6]);assert.equal(item.priceCents,4725);assert.equal(item.image,'https://media.tacdn.com/a-720.jpg');assert.equal(item.url,live(target).productUrl);}
 assert.match(items.find(i=>i.id==='viator:8718P33').title,/Guided Tour with Entry/,'guided admission remains a guided product');
});

test('focused failures and absent exact matches retain other real inventory without substitute attractions',async()=>{
 const items=await loadViator({VIATOR_API_KEY:'fixture-token'},{fetcher:async(url,opts)=>{
  const body=JSON.parse(opts.body);
  if(body.searchTerm&&body.searchTerm!=='limousine')return body.searchTerm==='London Zoo Entry Ticket'?{ok:false,status:429}:{ok:true,json:async()=>({products:{results:[product({productCode:'UNRELATED',title:body.searchTerm})]}})};
  return {ok:true,json:async()=>({products:url.endsWith('/search/freetext')?{results:[]}:[product({productCode:'P'+body.filtering.destination})]})};
 }});
 assert.equal(items.length,15);assert.ok(items.every(i=>i.id.startsWith('viator:P')));assert.ok(!items.some(i=>i.id==='viator:UNRELATED'));
});

test('verified transport targets enter only from exact live responses with real prices, images and tracked links',async()=>{
 const targets=[
  ['Hola Barcelona Public Transportation Travel Card','562','2512P37','Hola Barcelona Travel Card','Barcelona','ES','transit','metro bus tram public transport'],
  ['Lisbon City Card','538','59338P4','Lisbon City Card: 24, 48 or 72 Hours','Lisbon','PT','transit','metro bus tram public transport rail train'],
  ['Uber Boat River Roamer','737','5021CLIPPER','Uber Boat by Thames Clippers River Roamer Pass','London','GB','transit','boat waterbus river bus'],
  ['Venice Marco Polo Airport Shared Water Taxi Arrival Transfer','522','2495VENAPTHTL','Venice Marco Polo Airport Shared Water Taxi Arrival Transfer','Venice','IT','transfer','boat water taxi airport'],
  ['Venice Shared Water Taxi Departure Transfer','522','2495VENHTLAPT','Venice Shared Water Taxi Departure Transfer','Venice','IT','transfer','boat water taxi airport'],
  ['Heathrow Express Train Ticket','737','366941P584','Heathrow Express Train Ticket','London','GB','transit','rail train airport'],
  ['Venice Marco Polo Airport Direct Bus','522','5648785P23','Venice Marco Polo Airport Direct Bus to or from Venice and Mestre','Venice','IT','transit','bus coach airport']
 ];
 const live=t=>product({productCode:t[2],title:t[3],productUrl:'https://www.viator.com/tours/Real/d'+t[1]+'-'+t[2]+'?pid=P00333211&mcid=42383&medium=api',pricing:{summary:{fromPrice:19.75},currency:'EUR'}});
 const seen=[];
 const items=await loadViator({VIATOR_API_KEY:'fixture-token'},{fetcher:async(url,opts)=>{
  const body=JSON.parse(opts.body), target=targets.find(t=>t[0]===body.searchTerm);
  if(target){seen.push(body);assert.equal(body.productFiltering.destination,target[1]);return {ok:true,json:async()=>({products:{results:[product({productCode:target[2]+'UNRELATED',title:target[3]}),live(target)]}})};}
  return {ok:true,json:async()=>({products:url.endsWith('/search/freetext')?{results:[]}:body.filtering.destination==='562'?[live(targets[0])]:[]})};
 }});
 assert.equal(seen.length,7);assert.equal(items.length,7,'general and focused duplicates appear once');
 for(const target of targets){
  const item=items.find(i=>i.id==='viator:'+target[2]);assert.ok(item);
  assert.equal(item.title,target[3]);assert.equal(item.city,target[4]);assert.equal(item.countryCode,target[5]);assert.equal(item.category,target[6]);
  assert.equal(item.searchTerms,target[7]);assert.equal(item.priceCents,1975);assert.equal(item.image,'https://media.tacdn.com/a-720.jpg');assert.equal(item.url,live(target).productUrl);
 }
 assert.equal(viatorItem(live(targets[2]),{place:'London',countryCode:'GB'}).category,'transit','a network river-bus day pass is not advertised as a private boat taxi');
 assert.match(items.find(i=>i.id==='viator:2495VENAPTHTL').title,/Shared/,'shared water taxis retain the supplier’s exact service wording');
 assert.equal(viatorItem(product({productCode:'unverified',title:'A transport-themed walking tour'}),{place:'London',countryCode:'GB'}).searchTerms,undefined);
});
