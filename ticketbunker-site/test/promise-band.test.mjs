import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const PAGES=['index','about','contact','refund-policy','city-guides','hotels','travel','car-hire','restaurants','vip-transfers','plan-your-trip','stag-hen-weekends','vip','pricing','featured','for-organisers','advertise','support'];
test('public pages carry the no-fee promise, the partner-fee note, wallet and scanner app',()=>{
  for(const p of PAGES){
    const h=read(p+'.html');
    assert.equal((h.match(/<section class="tbp"/g)||[]).length,1,p);
    assert.match(h,/promise\.css\?v=/,p);
    assert.match(h,/No booking fees on our events/,p);
    assert.match(h,/Partners may add their own fees[^<]*We never add ours/,p);
    assert.match(h,/Apple Wallet[\s\S]*Google Wallet/,p);
    assert.match(h,/play\.google\.com\/store\/apps\/details\?id=pt\.soundbunker\.ticketbunkerscanner/,p);
    assert.match(h,/App Store coming soon/,p,'the iPhone scanner is not on the App Store yet');
  }
  assert.match(read('index.html'),/<section class="tbp" id="fan-benefits"/,'the homepage "Why buy direct" link still lands on it');
});
