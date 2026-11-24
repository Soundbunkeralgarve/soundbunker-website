import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guideHtml,guideContent} from '../api/city-guide.js';
import {cityBenefits} from '../city-guide-benefits.js';
import {CITY_PAGES,cityBySlug} from '../city-places.js';
const info={history:'A local historical fact.',food:'A local food market.',shopping:'A shopping street.',nightlife:'An established music district.',sources:[{title:'Official information',url:'https://example.com/city'}],checked:'2026-11-23'};
const shell=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('digital guides have local content, source links, download, print and correct canonicals',()=>{
  const html=guideHtml(shell,cityBySlug('london'),info);
  assert.match(html,/canonical" href="https:\/\/theticketbunker.com\/guides\/london/);
  assert.match(html,/A local historical fact/);assert.match(html,/A shopping street/);
  assert.match(html,/https:\/\/example.com\/city/);assert.match(html,/download="ticketbunker-london-city-guide.html"/);
  assert.match(html,/data-guide-print>.*Print/);assert.match(html,/Choose London/);
  assert.doesNotMatch(html,/Code:|exclusive discount|guaranteed discount/);
});
test('downloaded guide embeds its own styles and keeps absolute links for offline reading',()=>{
  const html=guideHtml(shell,cityBySlug('london'),info,{offline:true,css:'.city-guide-page{color:black}'});
  assert.match(html,/<style>\.city-guide-page\{color:black\}<\/style>/);
  assert.doesNotMatch(html,/<script type="module"|href="\/home.css"|data-guide-print/);
  assert.match(html,/https:\/\/theticketbunker.com\/london/);
  assert.match(html,/https:\/\/www.google.com\/maps\/search/);
});
test('vouchers require confirmed distribution, matching destination, valid dates and redemption terms',()=>{
  const now=Date.parse('2026-11-23'),base={approved:true,publicDistribution:true,title:'Confirmed dining benefit',description:'Read the conditions',terms:'Valid at named restaurant only',validUntil:'2027-01-01',url:'https://example.com/redeem',code:'PUBLIC-CODE',cities:['london']};
  assert.equal(cityBenefits(cityBySlug('london'),[base],now).filter(b=>b.type==='voucher').length,1);
  for(const patch of [{approved:false},{publicDistribution:false},{validUntil:'2026-01-01'},{terms:''},{url:'javascript:alert(1)'},{cities:['berlin']}])assert.equal(cityBenefits(cityBySlug('london'),[{...base,...patch}],now).filter(b=>b.type==='voucher').length,0);
  assert.equal(cityBenefits(cityBySlug('berlin'),[],now).length,0);
});
test('all city guide research records are complete, unique and linked to HTTPS sources',async()=>{
  const data=await guideContent();
  assert.equal(data.size,CITY_PAGES.length);
  for(const [slug] of CITY_PAGES){const g=data.get(slug);assert.ok(g,slug);for(const field of ['history','food','shopping','nightlife'])assert.ok(typeof g[field]==='string'&&g[field].length>35,slug+' '+field);assert.ok(g.sources.length>0,slug+' sources');for(const source of g.sources)assert.equal(new URL(source.url).protocol,'https:');assert.match(g.checked,/^2026-11-23$/);}
});
