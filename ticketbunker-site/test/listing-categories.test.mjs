import test from 'node:test';
import assert from 'node:assert/strict';
import {viatorItem, awinItem} from '../api/partner-feed.js';
import {nativeItem, feedItem, filterItems, discoveryCategories} from '../discovery-model.js';
import {homeRails} from '../sample-listings.js';

const product = (title, pricing = {summary:{fromPrice:32.5},currency:'EUR'}) => ({
  productCode:'12345P1',title,productUrl:'https://www.viator.com/tours/Algarve/Visit/d774-12345P1?pid=P00333211&mcid=42383&medium=api',pricing
});
const item = title => viatorItem(product(title),{place:'Algarve',countryCode:'PT'});

test('actual airport transfer, paddleboard and wine/music tour titles follow their activity intent',()=>{
  const examples=[
    ['Faro Airport Private Transfer to Carvoeiro','transfer'],
    ['Faro to Ablufeira Private Transfer','transfer'],
    ['Faro Airport Transfer Alvor Portimao Praia Rocha Ferragudo +','transfer'],
    ['Small Group Paddleboard Tour to the Benagil Cave with 4K Photos','sport'],
    ['Lagos, Portimão & Carvoeiro: Wine Tasting, Tapas & Music Tour','daysout'],
    ['Private Surf Lesson on the Algarve Coast','sport'],
    ['Luxury Limousine Evening in London','transfer'],
    ['Lisbon Private Chauffeur Service','transfer']
  ];
  for(const [title,category] of examples){const got=item(title);assert.equal(got.category,category,title);assert.equal(got.city,'Algarve');assert.equal(got.countryCode,'PT');assert.equal(got.priceCents,3250);assert.equal(got.url,product(title).productUrl);}
});

test('clear performance and event intents join their matching categories',()=>{
  const examples=[
    ['Paris Moulin Rouge Cabaret Show Ticket','shows'],
    ['The Lion King West End Musical Tickets','shows'],
    ['Rome Opera Performance Tickets','shows'],
    ['Seville Flamenco Show with Dinner','music'],
    ['Lisbon Live Fado Performance','music'],
    ['London Stand-Up Comedy Show','comedy'],
    ['Dublin Pub Crawl','club'],
    ['Paris Christmas Market Walking Tour','seasonal'],
    ['London Live Jazz Concert','music'],
    ['Barcelona Football Match Tickets','sport'],
    ['Family-Friendly Aquarium Tickets','family'],
    ['Benagil Caves Catamaran Cruise','boat'],
    ['Open Air Film Screening','cinema'],
    ['Summer Jazz Festival Tickets','festival']
  ];
  for(const [title,category] of examples)assert.equal(item(title).category,category,title);
});

test('historic tours, cultural visits and included transport do not become performances, boats or family events',()=>{
  for(const title of ['Santa Maria Church Historical Walking Tour','Historic Grotto Cave Tour','Paris Opera Garnier Guided Tour','Paris Opera Garnier Entry Ticket','London Football Stadium Tour','Abbey Road Music Walking Tour','West End Musical Theatre Walking Tour','Mamma Mia Film Museum Tour','Sintra sightseeing tour with round-trip hotel transfers'])assert.equal(item(title).category,'daysout',title);
});

test('a missing Viator price stays unknown while an actual zero remains free',()=>{
  for(const fromPrice of [undefined,null,'','   ',false])assert.equal(viatorItem(product('Walking tour',{summary:{fromPrice},currency:'EUR'}),{place:'Lisbon',countryCode:'PT'}).priceCents,null,String(fromPrice));
  for(const fromPrice of [0,'0','0.00'])assert.equal(viatorItem(product('Walking tour',{summary:{fromPrice},currency:'EUR'}),{place:'Lisbon',countryCode:'PT'}).priceCents,0);
});

test('Awin respects merchant/category evidence, stage productions precede music and generic tours remain days out',()=>{
  const row = (product_name,category_name='',merchant_id='999')=>({product_name,category_name,merchant_id,aw_product_id:'one',aw_deep_link:'https://www.awin1.com/pclick.php?p=1&a=3163272&m='+merchant_id});
  for(const title of ['Les Misérables Musical Tickets','The Lion King West End Tickets','Mamma Mia! Musical Tickets','Wicked Musical Ticket','Hamilton Theatre Tickets'])assert.equal(awinItem(row(title)).category,'shows',title);
  for(const title of ['London Food Walking Tour','Wine, Tapas & Music Tour','Show Me Lisbon Walking Tour'])assert.equal(awinItem(row(title)).category,'daysout',title);
  assert.equal(awinItem(row('A night out','Musicals')).category,'shows');
  assert.equal(awinItem(row('A night out','Concerts')).category,'music');
  assert.equal(awinItem(row('Generic title','Airport Transfers')).category,'transfer');
  assert.equal(awinItem(row('Generic title','Boat Tours')).category,'boat');
  assert.equal(awinItem(row('Generic title','Tours, Sightseeing & Cruises')).category,'daysout');
  assert.equal(awinItem(row('Wine, Tapas & Music Tour','Music Tours')).category,'daysout');
  assert.equal(awinItem(row('Concert title','Music','1936')).category,'shows','known theatre merchant category is preserved');
});

test('native sports/workshops and Viator transfer items are filterable using the same discovery model',()=>{
  const native={slug:'future-event',title:'Future event',starts_at:'2099-12-01T20:00:00Z',tiers:[{remaining:1,price_cents:1000}]};
  assert.equal(nativeItem({...native,event_kind:'sports'}).category,'sport');
  assert.equal(nativeItem({...native,event_kind:'workshop'}).category,'daysout');
  assert.equal(nativeItem({...native,event_kind:'community'}).category,'other');
  const transfer=feedItem(item('Private Limousine Transfer'));
  assert.equal(filterItems([transfer],{category:'transfer'}).length,1);
  assert.equal(discoveryCategories.transfer,'Limos, chauffeurs & transfers');
  assert.ok(homeRails.some(([key])=>key==='transfer'));
});
