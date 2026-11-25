import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
test('public HTML and generated pages reference one version of each revised design asset',()=>{
  const assets=['home.js','home-variety.css','public-navigation.js','mobile-imagery.css','public-mobile.css'];
  const paths=[...readdirSync(root).filter(p=>p.endsWith('.html')),...readdirSync(new URL('api/',root)).filter(p=>p.endsWith('.js')).map(p=>'api/'+p)];
  for(const asset of assets){
    const versions=new Map();
    const expression=new RegExp('/'+asset.replaceAll('.','\\.')+'\\?v=([A-Za-z0-9_-]+)','g');
    for(const path of paths)for(const match of read(path).matchAll(expression))versions.set(match[1],path);
    assert.equal(versions.size,1,asset+': '+JSON.stringify([...versions]));
    const version=asset==='public-mobile.css'?'20261125-mobile3':asset==='home.js'?'20261126-pro':asset==='public-navigation.js'?'20261126-meta2':asset==='mobile-imagery.css'?'20261125-appstyle':'20261125-consistent1';
    assert.ok(versions.has(version),asset);
  }
});
test('buyer-facing account families opt in without changing staff tool themes',()=>{
  for(const page of ['account','pricing','terms','support','featured','event','event-preview','event-ticket','ticket-preview','checkout-complete','door-paid']){
    const html=read(page+'.html');
    assert.match(html,/<body[^>]*class="[^"]*\btb-public-brand\b/,page);
    assert.match(html,/href="\/public-brand\.css\?v=20261125-consistent1"/,page);
    assert.match(html,/fonts\.googleapis\.com\/css2\?family=Barlow\+Condensed:wght@[^"&]*900/,page+' loads the display font');
    assert.match(html,/family=DM\+Sans:wght@/,page+' loads the body font');
  }
  for(const page of ['control-room','support-admin','organiser','event-scanner']){
    assert.doesNotMatch(read(page+'.html'),/tb-public-brand|public-brand\.css/,page);
  }
});
