import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {money,qrRuns,sellableTiers,doorSaleResult} from '../lib/door.js';
const app=readFileSync(new URL('../App.js',import.meta.url),'utf8');

test('door money and results read clearly at the door',()=>{
 assert.equal(money(1250,'eur'),'€12.50');assert.equal(money(500,'gbp'),'£5.00');assert.equal(money(undefined),'€0.00');
 assert.deepEqual(doorSaleResult('cash',{quantity:2,totalCents:2000,currency:'eur'}).heading,'CASH · ADMIT 2');
 assert.equal(doorSaleResult('card',{status:'paid',quantity:1,totalCents:1000}).kind,'approved');
 assert.equal(doorSaleResult('card',{status:'needs_attention'}).kind,'warning');
 assert.equal(doorSaleResult('card',{status:'cancelled'}).kind,'rejected');
});

test('payment QR is a valid square of merged dark runs',()=>{
 const {size,rows}=qrRuns('https://checkout.stripe.com/c/pay/cs_live_'+'a'.repeat(120)+'#fid='+'b'.repeat(200));
 assert.equal(rows.length,size);assert.ok(size>=21&&size<=101);
 for(const runs of rows)for(const [x,w] of runs)assert.ok(x>=0&&w>0&&x+w<=size);
 assert.ok(rows[0].length>0,'finder pattern is drawn');
});

test('only tickets with stock and a price are sold, except free rehearsal tickets',()=>{
 const tiers=[{id:'a',priceCents:1000,remaining:3},{id:'b',priceCents:1000,remaining:0},{id:'c',priceCents:0,remaining:5}];
 assert.deepEqual(sellableTiers({tiers}).map(t=>t.id),['a']);
 assert.deepEqual(sellableTiers({tiers,rehearsal:true}).map(t=>t.id),['a','c']);
 assert.deepEqual(sellableTiers(null),[]);
});

test('door sales retry safely and never charge on a rehearsal',()=>{
 assert.match(app,/requestId:Crypto\.randomUUID\(\)\};\n  try\{\n   let sale;/,'one reference per cash sale, reused on retry');
 assert.match(app,/if\(e\.status\|\|attempt>=2\)throw e;/,'only network failures are retried');
 assert.match(app,/disabled=\{busy\|\|door\.rehearsal\} onPress=\{\(\)=>onCard/);
 assert.doesNotMatch(app,/\b(?:allow|enable)\b[^\n"']*\bcamera\b/i);
});
