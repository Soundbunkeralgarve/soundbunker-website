import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {directoryProviders,tripDestination} from '../travel-directory.js';
import {tripOptions,awinLink} from '../trip-partners.js';
import {GUIDES} from '../guide-content.js';
import {guideProviders,providerCards} from '../trip-guides.js';
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
