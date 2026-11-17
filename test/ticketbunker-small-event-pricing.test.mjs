import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {plans,planOrder,planBands} from '../ticketbunker-site/pricing-rules.js';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const migration=read('SUPABASE_TICKETBUNKER_SMALL_EVENT_PRICING.sql');

test('small events pay smaller one-off fees and larger bands keep their prices',()=>{
 assert.deepEqual(planOrder.map(k=>[k,plans[k].capacity,plans[k].eur,plans[k].gbp]),[
  ['mini',50,2900,2900],['starter',100,4900,4900],['club',250,9900,9900],
  ['standard',500,19900,19900],['headline',1000,29900,29900],['event_plus',2000,39900,39900]]);
 assert.deepEqual(planBands,['Up to 50','51–100','101–250','251–500','501–1,000','1,001–2,000']);
});

test('database migration mirrors the website bands and prices',()=>{
 assert.match(migration,new RegExp(`names text\\[\\]:=array\\[${planOrder.map(k=>`'${k}'`).join(',')}\\];caps integer\\[\\]:=array\\[${planOrder.map(k=>plans[k].capacity).join(',')}\\];`));
 assert.match(migration,new RegExp(`prices:=array\\[${planOrder.map(k=>plans[k].eur).join(',')}\\];`));
 assert.match(migration,new RegExp(`unit:=case p_plan ${planOrder.map(k=>`when '${k}' then ${plans[k].eur}`).join(' ')} end;`));
 assert.match(migration,/if charity then band:=greatest\(band,6\);credit:=greatest\(credit,prices\[6\]\);end if;/);
 for(const k of planOrder)assert.ok(migration.includes(`'${k}'`),k);
});

test('organiser preview and published pages show the same bands',()=>{
 const preview=read('ticketbunker-site/organiser-v2.js');
 assert.match(preview,new RegExp(planOrder.map(k=>`\\[${plans[k].capacity},'${k}',${plans[k].eur}\\]`).join(',')));
 const organisers=read('ticketbunker-site/for-organisers.html');
 for(const [i,k] of planOrder.entries())assert.ok(organisers.includes(`<span>${planBands[i]} tickets</span><strong>€${plans[k].eur/100}</strong>`),k);
 const terms=read('ticketbunker-site/terms.html');
 assert.match(terms,/€29 \/ £29 up to 50 tickets, €49 \/ £49 up to 100, €99 \/ £99 up to 250, €199 \/ £199 up to 500/);
 const pricing=read('ticketbunker-site/pricing.html');
 for(const k of planOrder)assert.ok(pricing.includes(`<option value="${k}">`),k);
});

test('bundles are 5 events for 10% off and 10 events for 15% off, in the site and the database',()=>{
 const pricing=read('ticketbunker-site/pricing.html');
 assert.match(pricing,/<option value="5" selected>5 events · save 10%<\/option><option value="10">10 events · save 15%<\/option>/);
 assert.doesNotMatch(pricing,/value="[48]"/);
 assert.match(migration,/p_count not in \(1,5,10\)/);
 assert.match(migration,/case p_count when 5 then \.10 when 10 then \.15 else 0 end/);
 assert.match(migration,/check\(event_count in \(1,4,5,8,10\)\)/);
});
