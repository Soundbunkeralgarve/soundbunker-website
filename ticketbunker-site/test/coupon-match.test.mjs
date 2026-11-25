import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {matchCoupon, sellerKey} from '../coupon-match.js';

test('events match their seller’s live coupon code, never a code-less deal or another seller', () => {
  const offers = [{id: '1', advertiser: 'Theatre Tickets Direct', code: 'awinvouch', title: '3% Off'},
    {id: '2', advertiser: 'Entradas.com_PRM ES', code: '', title: 'Espectáculos en promoción'},
    {id: '3', advertiser: 'Entradas.com_PRM ES', code: 'TB5', title: '5% off'}];
  assert.equal(sellerKey('Entradas.com_PRM ES'), sellerKey('Entradas.com'));
  assert.equal(matchCoupon(offers, 'Theatre Tickets Direct').code, 'awinvouch');
  assert.equal(matchCoupon(offers, 'Entradas.com').id, '3', 'only offers with a code pop up');
  assert.equal(matchCoupon(offers, 'Skiddle'), null);
  assert.equal(matchCoupon(offers, ''), null);
  const home = readFileSync(new URL('../home.js', import.meta.url), 'utf8');
  assert.match(home, /data-seller="\$\{esc\(item\.seller\|\|''\)\}" data-country=/);
  assert.match(readFileSync(new URL('../index.html', import.meta.url), 'utf8'), /coupon-match\.js\?v=/);
});

test('a stale cached, future or similarly named seller code is never offered',()=>{
  const now=Date.parse('2026-11-25T15:00:00Z');
  const offer={advertiser:'Theatre Tickets Direct',code:'awinvouch',starts:'2023-12-18',ends:'2026-12-31'};
  assert.equal(matchCoupon([offer],'Theatre Tickets Direct',now)?.code,'awinvouch');
  assert.equal(matchCoupon([{...offer,ends:'2026-11-24'}],'Theatre Tickets Direct',now),null);
  assert.equal(matchCoupon([{...offer,starts:'2026-11-26'}],'Theatre Tickets Direct',now),null);
  assert.equal(matchCoupon([offer],'Theatre Tickets Direct Other',now),null);
});


test('a real coupon decorates a swipe ticket and keyboard activation keeps its original booking link',async()=>{
  const badge=[],dialogs=[],listeners={},focus=[];
  const hero={dataset:{seller:'Theatre Tickets Direct',country:'GB'},target:'_blank',href:'https://www.awin1.com/pclick.php?p=123&a=3163272&m=1936',isConnected:true,
    querySelector:selector=>selector.includes('.hs-art')?{insertAdjacentHTML:(_where,html)=>badge.push(html)}:null,
    closest(selector){return selector.includes('a.hs-ticket[data-coupon]')&&this.dataset.coupon?this:null;},focus(){focus.push('ticket');}};
  const document={activeElement:hero,head:{append(){}},body:{append:box=>dialogs.push(box)},
    querySelectorAll:selector=>selector.includes('.hs-ticket[data-seller]')?[hero]:[],
    createElement:tag=>tag==='style'?{}:{setAttribute(){},addEventListener(){},remove(){},querySelector:()=>({focus:()=>focus.push('continue')})},
    addEventListener:(type,fn)=>{listeners[type]=fn;},removeEventListener(){}};
  const source=readFileSync(new URL('../coupon-match.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'').replace(/export /g,'');
  vm.runInNewContext(source,{document,esc:v=>String(v||''),Date,AbortSignal,MutationObserver:class{observe(){}},
    fetch:async()=>({ok:true,json:async()=>({offers:[{id:'2512547',advertiser:'Theatre Tickets Direct',title:'3% Off',code:'awinvouch',ends:'2026-12-31'}]})}),
    sessionStorage:{getItem:()=>null,setItem(){}},setTimeout});
  await new Promise(setImmediate);
  assert.equal(hero.dataset.coupon,'2512547');assert.match(badge[0],/Coupon code/);
  let prevented=false;
  await listeners.click({target:hero,button:0,preventDefault(){prevented=true;}});
  assert.equal(prevented,true);assert.equal(dialogs.length,1);assert.match(dialogs[0].innerHTML,/awinvouch/);
  assert.ok(dialogs[0].innerHTML.includes(hero.href),'continue uses the original event deep link');
  assert.match(dialogs[0].innerHTML,/target="_blank"/);assert.deepEqual(focus,['continue']);
  listeners.keydown({key:'Escape',preventDefault(){}});assert.deepEqual(focus,['continue','ticket']);
});
