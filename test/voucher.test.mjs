import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import vm from 'node:vm';
import { getSession } from '../api/lib/catalog.js';

const source=await readFile(new URL('../api/lib/redeem.js',import.meta.url),'utf8');
const code='SB-26-ABCD1234';
const request={headers:{'x-forwarded-for':'203.0.113.4'}};

async function harness({voucher=null,prize=null,claims=[],allowed=true}={}) {
  const state={voucher,prize,claims,allowed};
  const admin={
    rpc:async name => {assert.equal(name,'allow_voucher_code_check');return {data:state.allowed};},
    from:table => {
      const query={filters:[],options:{},select(_columns,options={}){this.options=options;return this;},
        eq(key,value){this.filters.push([key,value]);return this;},
        result(){const all=table==='vouchers'?[state.voucher]:table==='prize_codes'?[state.prize]:state.claims;
          const rows=all.filter(Boolean).filter(row=>this.filters.every(([key,value])=>row[key]===value));
          return this.options.head?{count:rows.length,data:null}:{data:rows};},
        async maybeSingle(){return {data:this.result().data[0]||null};},
        then(resolve,reject){return Promise.resolve(this.result()).then(resolve,reject);}
      };return query;
    }
  };
  const context=vm.createContext({process:{env:{SUPABASE_SECRET_KEY:'test-secret'}},Date});
  const module=new vm.SourceTextModule(source,{context});
  await module.link(specifier=>{
    const exports=specifier==='node:crypto'?{createHmac}:{safeText:(value,max)=>String(value||'').trim().slice(0,max)};
    return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value);},{context});
  });
  await module.evaluate();
  return {quote:module.namespace.quoteVoucher,giftExperiences:module.namespace.GIFT_EXPERIENCES,admin,state};
}

test('each purchased gift experience books its own full entitlement for €0',async()=>{
  const examples=[['voucher-starter','gift-starter-1h',120,1],['voucher-pro','gift-pro-2h',200,2],['voucher-popstar','gift-popstar-2h',250,2]];
  for(const [purchased,bookable,price,hours] of examples){
    const {quote,admin,giftExperiences}=await harness({voucher:{code,service_id:purchased,status:'active',amount_eur:price,remaining_eur:price,expires_at:'2099-01-01T00:00:00Z'}});
    assert.equal(giftExperiences[purchased],bookable);
    const session=getSession(bookable);
    assert.equal(session.hours,hours);
    const result=await quote(admin,code,session,bookable,request);
    assert.equal(result.source,'gift');
    assert.equal(result.credit,price);
    assert.equal(result.due,0);
  }
});

test('a partly used gift charges only the remainder for its named experience',async()=>{
  const {quote,admin}=await harness({voucher:{code,service_id:'voucher-pro',status:'active',amount_eur:200,remaining_eur:85,expires_at:'2099-01-01T00:00:00Z'}});
  const result=await quote(admin,code,getSession('gift-pro-2h'),'gift-pro-2h',request);
  assert.equal(result.credit,85);
  assert.equal(result.due,115);
});

test('a one-hour prize cannot be used after its first claim',async()=>{
  const prize={code,service_id:'prize-recording-1h',active:true,expires_at:'2099-01-01T00:00:00Z',id:'prize-id'};
  const {quote,admin,state}=await harness({prize});
  const first=await quote(admin,code,getSession('prize-recording-1h'),'prize-recording-1h',request);
  assert.equal(first.source,'prize');assert.equal(first.due,0);
  state.claims=[{prize_id:'prize-id',status:'used',booking_id:'booked'}];
  await assert.rejects(()=>quote(admin,code,getSession('prize-recording-1h'),'prize-recording-1h',request),/already been used/);
});

test('rate limits code guessing before revealing gift or prize status',async()=>{
  const {quote,admin}=await harness({allowed:false});
  await assert.rejects(()=>quote(admin,code,getSession('gift-starter-1h'),'gift-starter-1h',request),/Too many code checks/);
});
