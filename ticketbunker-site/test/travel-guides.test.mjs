import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {directoryProviders,tripDestination,tripDates} from '../travel-directory.js';
import {tripOptions,awinLink} from '../trip-partners.js';
import {GUIDES} from '../guide-content.js';
import {guideProviders,providerCards,tripSummary,nextWeekend} from '../trip-guides.js';
import {sitemapXml} from '../api/sitemap.js';
import {CITY_PAGES} from '../city-places.js';
const read = p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('hotel destinations infer countries, preserve accents and encode input as data',()=>{
  assert.equal(tripDestination('','Málaga').country,'ES');
  const u=new URL(directoryProviders('stay','PT','Lisbon & Sintra')[0].url);
  assert.equal(u.searchParams.get('destination'),'Lisbon & Sintra, Portugal');
  assert.equal(tripDestination('xx','London\n').city,'London');
  assert.equal(new URL(directoryProviders('stay','','London')[0].url).searchParams.get('destination'),'London, United Kingdom');
});
test('shared travel searches work on native engines without Intl.DisplayNames',async()=>{
  const original=Intl.DisplayNames;
  try{
    Intl.DisplayNames=undefined;
    const {tripDestination:destination,directoryProviders:providers}=await import('../travel-directory.js?without-display-names');
    assert.equal(destination('','London').search,'London, GB');
    assert.equal(new URL(providers('stay','PT','Lisbon')[0].url).searchParams.get('destination'),'Lisbon, PT');
  }finally{Intl.DisplayNames=original;}
});
test('dining adapts to countries without inventing a nationwide discount',()=>{
  assert.equal(new URL(directoryProviders('eat','PT','Lisbon')[0].url).hostname,'www.thefork.pt');
  assert.equal(directoryProviders('eat','DE','Berlin').length,1);
  assert.equal(new URL(directoryProviders('eat','DE','Berlin')[0].url).hostname,'www.google.com');
});
test('only individually approved and country-matching affiliate entries gain tracking',()=>{
  const providers=[['stay','Approved',['GB'],true,()=>awinLink(16634,'https://www.hotel.info/')],['stay','Pending',['GB'],false,()=>awinLink(1,'https://example.com/')]];
  const gb=tripOptions('GB','London',{providers}).flatMap(o=>o.partners);
  assert.ok(gb.find(p=>p.name==='Approved'&&p.commercial==='affiliate'));
  assert.ok(!gb.some(p=>p.name==='Pending'));
  assert.ok(!tripOptions('FR','Paris',{providers}).flatMap(o=>o.partners).some(p=>p.name==='Approved'));
});
test('all travel hubs have real server-rendered provider links, unique canonicals and sitemap entries',()=>{
  const xml=sitemapXml();
  for(const g of GUIDES){
    const html=read(g.slug+'.html');
    assert.ok(html.includes('rel="canonical" href="https://theticketbunker.com/'+g.slug+'"'));
    assert.equal((html.match(/<h1>/g)||[]).length,1);
    assert.ok(guideProviders(g.kind,'GB','London').length>0);
    assert.match(html,/target="_blank" rel="noopener noreferrer"/);
    assert.ok(xml.includes('https://theticketbunker.com/'+g.slug+'</loc>'));
    assert.match(html,/application\/ld\+json/);
    assert.doesNotMatch(html,/guaranteed savings|guaranteed lowest|approved partner/i);
  }
  assert.match(providerCards([{name:'<script>',url:'https://example.com/?a=1&b=2',category:'A&B',commercial:'direct'}]),/&lt;script&gt;/);
});
test('all destination guides are linked from the directory and discoverable in the sitemap',()=>{
  const html=read('city-guides.html'),xml=sitemapXml();
  for(const [slug] of CITY_PAGES){assert.ok(html.includes('href="/guides/'+slug+'"'));assert.ok(xml.includes('/guides/'+slug+'</loc>'));}
});
test('hotel and car searches open the provider on the chosen dates, guests and rooms',()=>{
  const trip={from:'2026-12-11',to:'2026-12-13',adults:'5',rooms:'2'};
  const [expedia,booking]=directoryProviders('stay','PT','Lisbon',trip).map(p=>new URL(p.url));
  assert.equal(expedia.searchParams.get('startDate'),'2026-12-11');assert.equal(expedia.searchParams.get('endDate'),'2026-12-13');
  assert.equal(expedia.searchParams.get('rooms'),'2');assert.deepEqual(expedia.searchParams.getAll('adults'),['3','2'],'one adults value per room');
  assert.equal(booking.hostname,'www.booking.com');assert.equal(booking.searchParams.get('ss'),'Lisbon, Portugal');
  assert.equal(booking.searchParams.get('checkin'),'2026-12-11');assert.equal(booking.searchParams.get('group_adults'),'5');assert.equal(booking.searchParams.get('no_rooms'),'2');
  const car=new URL(directoryProviders('car','PT','Lisbon',{from:'2026-12-11',to:'2026-12-14',pickup:'18:30',dropoff:'09:00'})[0].url);
  assert.equal(car.pathname,'/carsearch');assert.equal(car.searchParams.get('d1'),'2026-12-11');assert.equal(car.searchParams.get('time1'),'0630PM');assert.equal(car.searchParams.get('time2'),'0900AM');
  // Bad input never reaches the provider.
  const bad=new URL(directoryProviders('stay','GB','London',{from:'2026-12-13',to:'2026-12-11',adults:'99',rooms:'x'})[0].url);
  assert.equal(bad.searchParams.get('endDate'),null);assert.equal(bad.searchParams.get('adults'),null);
  assert.deepEqual(tripDates({from:'2026-12-11',to:'2026-12-13',adults:1,rooms:4}),{from:'2026-12-11',to:'2026-12-13',nights:2,adults:1,rooms:1,pickup:'',dropoff:''});
  assert.equal(tripSummary('stay',trip),'Fri 11 Dec → Sun 13 Dec · 2 nights · 5 adults · 2 rooms');
  assert.deepEqual(nextWeekend(new Date('2026-11-25T10:00:00Z')),{from:'2026-11-27',to:'2026-11-29'});
  assert.equal(new URL(tripOptions('GB','London',{trip}).find(o=>o.kind==='stay').partners[0].url).searchParams.get('startDate'),'2026-12-11');
  for(const page of ['hotels','car-hire'])assert.match(read(page+'.html'),/name="from" type="date"[\s\S]*name="to" type="date"/);
});
