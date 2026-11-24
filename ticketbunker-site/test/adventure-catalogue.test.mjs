import test from 'node:test';
import assert from 'node:assert/strict';
import {searchAdventures} from '../api/lib/adventure-catalogue.js';
import {approvedAttractions} from '../api/lib/approved-attractions.js';
import {activityIntent,activityContext,activityProviderSearch} from '../activity-search.js';
import {viatorItem,findPartnerListing,matchingListings} from '../api/partner-feed.js';
import {blend,filterItems} from '../discovery-model.js';
import {eventLink} from '../event-share.js';
import {partnerPage} from '../api/partner-page.js';

const now=Date.parse('2026-11-24T10:00:00Z'),env={VIATOR_API_KEY:'fixture-token'};
const raw=(productCode,title,url='https://www.viator.com/tours/Prague/Activity/d462-'+productCode+'?pid=P00333211')=>({productCode,title,productUrl:url,pricing:{summary:{fromPrice:35},currency:'EUR'}});

test('activity intent never confuses live-fire ranges, unrelated performances or karting food names with adventure stock',()=>{
 for(const [q,intent] of [['go-karting','karting'],['go kart London','karting'],['paint ball','paintball'],['Paintballing Prague','paintball'],['quad biking Warwick','quad'],['ATV tour','quad'],['4x4','offroad'],['off-road buggy','offroad']])assert.equal(activityIntent(q),intent);
 for(const q of ['shooting range','Kartoffelsalat','Wicked','paint exhibition'])assert.equal(activityIntent(q),'');
 assert.equal(activityContext({activity:'unknown',city:'London',country:'GB'}),null);
 assert.equal(activityContext({activity:'paintball',city:'',country:'GB'}),null);
});

test('only exact activity evidence in live supplier titles becomes a priced, tracked day-out listing; repeated searches reuse current supply',async()=>{
 const calls=[];
 const fetcher=async(url,request)=>{calls.push({url,request,payload:JSON.parse(request.body)});return{ok:true,json:async()=>({products:{results:[raw('PB1','Prague Outdoor Paintball Experience'),raw('GUN1','Prague Shooting Range'),raw('BAD1','Prague Paintball','https://untrusted.example/book')]}})};};
 const options={env,fetcher,normalise:viatorItem,places:[],now};
 const items=await searchAdventures({q:'paintball Prague',city:'Prague',country:'CZ'},options);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.viator.com/partner/search/freetext');
 assert.equal(calls[0].payload.productFiltering.destination,'462');assert.equal(calls[0].payload.searchTerm,'paintball');
 assert.deepEqual(items.map(p=>p.id),['viator:PB1']);assert.equal(items[0].category,'daysout');assert.equal(items[0].priceCents,3500);
 assert.deepEqual(items[0].activityContext,{activity:'paintball',city:'Prague',country:'CZ'});
 assert.equal(new URL(items[0].url).searchParams.get('pid'),'P00333211');
 await searchAdventures({q:'paintball',city:'Prague',country:'CZ'},options);assert.equal(calls.length,1);
 const [item]=blend([],[],now,items);assert.equal(filterItems([item],{q:'paintballing',country:'CZ'},now).length,1);
 const share=new URL(eventLink(item));assert.equal(share.pathname,'/listing/viator%3APB1');
 assert.deepEqual(Object.fromEntries(share.searchParams),items[0].activityContext);
 assert.ok(findPartnerListing(items,'viator:PB1',now));
 const html=partnerPage('<head><title>Shell</title></head><header></header><footer></footer>',items[0]);
 assert.match(html,/activity=paintball(?:&amp;|&)city=Prague/);assert.match(html,/You book and pay on Viator/);
 assert.equal(filterItems([item],{when:'week'},now).length,0,'open-dated products never invent availability for explicit dates');
});

test('unknown or conflicting places never guess a supplier destination, and cannot change the approved search hostname or tracking',async()=>{
 let calls=0;const opts={env,normalise:viatorItem,places:[['London','GB','737']],fetcher:async()=>{calls++;throw Error('unexpected');},now};
 for(const query of [{q:'karting',city:'London',country:'PT'},{q:'karting',city:'Unknown town',country:'GB'},{q:'Wicked',city:'London',country:'GB'}])assert.deepEqual(await searchAdventures(query,opts),[]);
 assert.equal(calls,0);
 const link=activityProviderSearch({q:'paintball',city:'Northampton',country:'GB'}),url=new URL(link.url);
 assert.equal(url.origin,'https://www.viator.com');assert.equal(url.searchParams.get('pid'),'P00333211');assert.equal(url.searchParams.get('text'),'Northampton, United Kingdom paintball');
 assert.equal(activityProviderSearch({q:'ordinary show'}),null);
 await assert.rejects(()=>searchAdventures({q:'karting',city:'London',country:'GB'},{env:{},normalise:viatorItem}),/not configured/);
});

test('partial provider failures retain successful activity stock and fully failed refreshes never reuse expired prices',async()=>{
 let calls=0,fail=false;
 const fetcher=async(url,req)=>{calls++;const dest=JSON.parse(req.body).productFiltering.destination;if(fail || dest==='737')return{ok:false,status:503};return{ok:true,json:async()=>({products:{results:[raw('Q'+dest,'Quad Bike Trekking')]}})};};
 const options={env,fetcher,normalise:viatorItem,places:[['London','GB','737']],now};
 const first=await searchAdventures({q:'quad',country:'GB'},options);assert.equal(first.length,1);assert.equal(first[0].city,'Warwick');assert.equal(calls,2);
 fail=true;
 await assert.rejects(()=>searchAdventures({q:'quad',country:'GB'},{...options,now:now+6*60000}),/unavailable/);
 assert.equal(calls,4);
});

test('approved park publication has an approval start and review expiry, one park only and no invented current price',()=>{
 assert.deepEqual(approvedAttractions(Date.parse('2026-11-23T12:00:00Z')),[]);
 assert.deepEqual(approvedAttractions(Date.parse('2026-12-24T00:00:00Z')),[]);
 const [park]=approvedAttractions(now),url=new URL(park.url);
 assert.equal(park.countryCode,'DE');assert.equal(park.category,'family');assert.equal(park.priceCents,null);
 assert.equal(url.searchParams.get('awinmid'),'116511');assert.equal(url.searchParams.get('awinaffid'),'3163272');
 assert.match(park.title,/2027 season/);assert.match(park.description,/19 March 2027/);
 assert.equal(matchingListings([park],{city:'Haßloch',country:'DE'}).length,1);
 assert.equal(filterItems(blend([],[],now,[park]),{country:'DE',category:'family',city:'Haßloch'},now).length,1);
 assert.equal(matchingListings([park],{city:'Berlin',country:'DE'}).length,0);
});
