import test from 'node:test';
import assert from 'node:assert/strict';
import {selectGBPRate,accountingAmounts,ECB_RATES} from '../api/lib/invoice-currency.js';
const xml="<Cube><Cube time='2026-10-21'><Cube currency='GBP' rate='0.83825'/></Cube><Cube time='2026-10-20'><Cube currency='GBP' rate='0.85'/></Cube></Cube>";
test('ECB selection uses the most recent published rate on or before the tax point',()=>{
 assert.equal(selectGBPRate(xml,'2026-10-20').rate,0.85);assert.equal(selectGBPRate(xml,'2026-10-25').rate,0.83825);assert.equal(selectGBPRate(xml,'2026-10-20').source,ECB_RATES);
 assert.throws(()=>selectGBPRate(xml,'2026-10-19'),/unavailable/);assert.throws(()=>selectGBPRate(xml,'2026-11-05'),/unavailable/);
});
test('GBP converts once to EUR accounting cents, with an exact original-currency round trip',async()=>{
 const result=await accountingAmounts({currency:'gbp',amount_cents:10000},'2026-10-20',async()=>selectGBPRate(xml,'2026-10-20'));assert.equal(result.fiscal_total_cents,11765);assert.equal(result.currency_code,'GBP');assert.equal(Math.round(result.fiscal_total_cents*Number(result.rate)),10000);
 assert.deepEqual(await accountingAmounts({currency:'eur',amount_cents:12300},'2026-10-20'),{fiscal_total_cents:12300,accounting_currency:'eur'});
});
test('future, stale and inverted exchange-rate evidence cannot issue a foreign-currency invoice',async()=>{
 for(const fx of [{date:'2026-10-21',base:'EUR',quote:'GBP',rate:0.85},{date:'2026-10-01',base:'EUR',quote:'GBP',rate:0.85},{date:'2026-10-20',base:'GBP',quote:'EUR',rate:1.2}])await assert.rejects(accountingAmounts({currency:'gbp',amount_cents:10000},'2026-10-20',async()=>fx),/Verified/);
});
