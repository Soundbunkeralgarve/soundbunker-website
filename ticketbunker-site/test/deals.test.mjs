import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {CITY_PAGES} from '../city-places.js';
import {offerItem, offerKind, loadOffers} from '../api/partner-offers.js';
import {offerCity, couponCard, dealSearchContext} from '../deals.js';

const raw = (c = {}) => ({promotionId: 123, type: 'voucher', advertiser: {id: 7, name: 'Pizza Place', joined: true}, title: '20% off pizza in Manchester',
  description: 'Dine in or takeaway', terms: 'Min spend £20', startDate: '2026-11-01T00:00:00.000', endDate: '2026-12-31T00:00:00.000',
  url: 'https://pizza.example/', urlTracking: 'https://www.awin1.com/cread.php?awinmid=7&awinaffid=3163272', voucher: {code: 'TB20', exclusive: false}, ...c});
const NOW = Date.parse('2026-11-25T10:00:00Z');

test('Awin offers become coupon cards only with a tracked link and while live', () => {
  const o = offerItem(raw(), NOW);
  assert.equal(o.code, 'TB20'); assert.equal(o.kind, 'food'); assert.equal(o.ends, '2026-12-31'); assert.match(o.url, /^https:\/\/www\.awin1\.com\//);
  assert.equal(offerItem(raw({urlTracking: 'https://pizza.example/'}), NOW), null, 'never an untracked or non-Awin link');
  assert.equal(offerItem(raw({endDate: '2026-11-01T00:00:00.000'}), NOW), null, 'expired offers are dropped');
  assert.equal(offerItem(raw({type: 'promotion', voucher: undefined}), NOW).type, 'deal');
  assert.equal(offerKind('Kids go free at the zoo'), 'kids'); assert.equal(offerKind('2-for-1 theatre tickets'), 'events'); assert.equal(offerKind('Cheap trains to Leeds'), 'travel');
  assert.equal(offerCity(o, 'GB'), 'Manchester'); assert.equal(offerCity(o, 'ES'), '');
  assert.doesNotMatch(couponCard({...o, title: '<script>'}, ''), /<script>/);
});

test('no token means no fake deals; joined-only search per country', async () => {
  assert.deepEqual(await loadOffers('GB', {env: {}}), {ready: false, offers: []});
  let sent;
  const out = await loadOffers('PT', {env: {AWIN_API_TOKEN: ' tok '}, now: NOW, fetcher: async (url, opts) => { sent = {url, body: JSON.parse(opts.body)}; return {ok: true, json: async () => [raw(), raw({promotionId: 9, urlTracking: 'http://x'})]}; }});
  assert.equal(out.offers.length, 1);
  assert.match(sent.url, /^https:\/\/api\.awin\.com\/publisher\/3163272\/promotions\?accessToken=tok$/);
  assert.deepEqual(sent.body.filters, {membership: 'joined', regionCodes: ['PT'], status: 'active', type: 'all'});
  assert.match(readFileSync(new URL('../deals.html', import.meta.url), 'utf8'), /data-deals-grid/);
  assert.match(readFileSync(new URL('../public-navigation.js', import.meta.url), 'utf8'), /a\.href='\/deals'/);
});

test('offers show only in their own countries and languages, and parks and parties sort as days out or kids', async () => {
  const {offerItem: item, offerLanguage, offerKind: kind} = await import('../api/partner-offers.js');
  const de = raw({title: 'Black Friday Deal im Majaland Deutschland', description: 'Jetzt Tickets sichern und sparen', advertiser: {name: 'Plopsaland Deutschland'}, regions: {all: true}});
  assert.equal(offerLanguage(de.title + ' ' + de.description), 'de');
  assert.equal(item(de, NOW, 'GB'), null, 'German-language deals stay out of the UK');
  assert.ok(item(de, NOW, 'DE'));
  assert.equal(item(raw({regions: {all: false, list: [{countryCode: 'GB', name: 'UK'}]}}), NOW, 'ES'), null, 'Awin region list respected');
  assert.ok(item(raw({regions: {all: false, list: [{countryCode: 'GB', name: 'UK'}]}}), NOW, 'GB'));
  assert.equal(kind('Deine Geburtstagsparty im Winter im Majaland'), 'kids');
  assert.equal(kind('Black Friday Deal im Majaland Deutschland'), 'daysout');
  assert.equal(kind('ESPECTÁCULOS EN PROMOCIÓN'), 'events');
});


test('linked deals keep a canonical city in its country and reject a mismatched country', () => {
  assert.deepEqual(dealSearchContext('?city=manchester&country=gb&kind=food'), {country:'GB',city:'Manchester',kind:'food'});
  assert.deepEqual(dealSearchContext('?city=Lisbon', 'GB'), {country:'PT',city:'Lisbon',kind:'all'});
  assert.deepEqual(dealSearchContext('?city=Lisbon&country=GB'), {country:'GB',city:'',kind:'all'});
  assert.deepEqual(dealSearchContext('?city=Nowhere&country=ES&kind=unknown'), {country:'ES',city:'',kind:'all'});
});

test('deal page restores, filters and retains a linked city even when no local offer is available', async () => {
  const select = () => ({value:'', options:[], handlers:{}, replaceChildren(...options){this.options=options;this.value=options[0]?.value || '';}, addEventListener(type,fn){this.handlers[type]=fn;}});
  const country=select(), city=select(), form={elements:{country,city}};
  const grid={innerHTML:'',addEventListener(){}}, status={textContent:''}, kinds={innerHTML:'',handlers:{},addEventListener(type,fn){this.handlers[type]=fn;}};
  const location={pathname:'/deals',search:'?country=GB&city=Manchester&kind=food'};
  const history={url:'',replaceState(_state,_title,url){this.url=url;}};
  let rows=[{id:'man',title:'Pizza in Manchester',kind:'food',advertiser:'Pizza',url:'https://example.com/'},
    {id:'lon',title:'Pizza in London',kind:'food',advertiser:'Pizza',url:'https://example.com/'}];
  const source=readFileSync(new URL('../deals.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  vm.runInNewContext(source, {CITY_PAGES,esc:v=>String(v || ''),URLSearchParams,Intl,Option:function(text,value){this.text=text;this.value=value;},location,history,
    navigator:{language:'en-GB'},document:{querySelector:s=>({'[data-deals-form]':form,'[data-deals-grid]':grid,'[data-deals-status]':status,'[data-deals-kinds]':kinds}[s])},
    fetch:async()=>({ok:true,json:async()=>({ready:true,offers:rows})})});
  await new Promise(setImmediate);
  assert.equal(city.value,'Manchester');
  assert.match(grid.innerHTML,/Pizza in Manchester/);assert.doesNotMatch(grid.innerHTML,/Pizza in London/);
  assert.equal(history.url,'/deals?country=GB&city=Manchester&kind=food');
  rows=[];await country.handlers.change();
  assert.equal(city.value,'Manchester','an empty feed must not reset the visitor to every city');
  assert.ok(city.options.some(o=>o.value==='Manchester'));
  assert.match(history.url,/city=Manchester/);
  city.value='';city.handlers.change();
  assert.equal(history.url,'/deals?country=GB&kind=food','clearing the city clears the URL filter');
  city.value='Manchester';city.handlers.change();
  country.value='PT';await country.handlers.change();
  assert.equal(city.value,'');assert.equal(history.url,'/deals?country=PT&kind=food');
});
