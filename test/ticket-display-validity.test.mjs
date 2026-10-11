import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFileSync} from 'node:fs';
async function run(status,eventStatus='published',valid=true){
 const context=vm.createContext({console});const row={sb_event_orders:{status,customer_name:'Holder'},sb_events:{status:eventStatus,title:'Event'},sb_event_tiers:{name:'Admission'},transfer_version:1};
 const db={from(){return {select(){return this},eq(){return this},single:async()=>({data:row})}}};
 const m=new vm.SourceTextModule(readFileSync(new URL('../api/event-ticket.js',import.meta.url),'utf8'),{context});
 await m.link(async spec=>{const values=spec.includes('http')?{json:(r,data,status=200)=>({status,data})}:{eventsDatabase:()=>db,validTicket:()=>valid};const mod=new vm.SyntheticModule(Object.keys(values),function(){for(const k of Object.keys(values))this.setExport(k,values[k]);},{context});return mod;});await m.evaluate();return m.namespace.default({method:'GET',query:{id:'id',sig:'signature'}},{});
}
test('paid tickets remain displayable',async()=>assert.equal((await run('paid')).status,200));
test('refunded and cancelled tickets cannot display an admission QR',async()=>{assert.equal((await run('refunded')).status,409);assert.equal((await run('paid','cancelled')).status,409);});
test('old transfer signature is rejected before admission is returned',async()=>assert.equal((await run('paid','published',false)).status,403));
