import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import handler from '../api/[endpoint].js';
import {refundPresentation,filterSupportCases,supportCaseHref,supportStatuses,supportCategories} from '../support-model.js';

function supportRuntime(api) {
  const nodes=new Map();
  const node=()=>({hidden:false,disabled:false,textContent:'',value:'',dataset:{},options:[{}],children:[],
    classList:{toggle(){}},setAttribute(){},addEventListener(){},append(...children){this.children.push(...children);},
    replaceChildren(...children){this.children=children;},reset(){},focus(){},remove(){}});
  const get=selector=>{if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);};
  const source=readFileSync(new URL('../support.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'');
  const withoutBoot=source.slice(0,source.lastIndexOf('(async () => {'));
  const context={document:{body:{dataset:{}},querySelector:get,createElement:node},location:{search:''},history:{replaceState(){}},
    URLSearchParams,crypto:{randomUUID:()=> 'stable-request'},api,date:value=>value,money:()=>'',
    supportStatuses,supportCategories,refundPresentation,filterSupportCases,supportCaseHref};
  vm.runInNewContext(withoutBoot+'\nsb={auth:{getSession:async()=>({data:{session:{access_token:"token"}}})}};this.test={request,showSignedOut,loadCases,getCases:()=>cases,getOffset:()=>nextOffset};',context);
  return {context,nodes,get};
}

test('refund approval and processing never imply payment confirmation',()=>{
  for(const status of ['requested','reviewing','approved','processing','declined','unrecognised']) {
    const value=refundPresentation({status});
    assert.equal(value.confirmed,false,status);
    assert.notEqual(value.title,'Refund confirmed',status);
  }
  assert.equal(refundPresentation({status:'refunded'}).confirmed,true);
  assert.equal(refundPresentation(null),null);
});
test('support queue prioritises urgent unresolved cases and keeps resolved history below them',()=>{
  const cases=[
    {id:'resolved',status:'resolved',priority:'urgent',createdAt:'2026-01-01'},
    {id:'new-normal',status:'open',priority:'normal',createdAt:'2026-03-01'},
    {id:'old-normal',status:'waiting_supplier',priority:'normal',createdAt:'2026-01-01'},
    {id:'urgent',status:'open',priority:'urgent',createdAt:'2026-06-01'}
  ];
  assert.deepEqual(filterSupportCases(cases).map(x=>x.id),['urgent','old-normal','new-normal','resolved']);
  assert.equal(cases[0].id,'resolved','display sorting must not mutate the saved response');
});
test('staff search combines status and booking context without exposing arbitrary links',()=>{
  const cases=[{id:'a',reference:'TB-123',subject:'Missing ticket',eventName:'Comedy tonight',customerEmail:'BUYER@example.com',status:'open'},
    {id:'b',reference:'TB-124',subject:'Missing ticket',status:'resolved'}];
  assert.deepEqual(filterSupportCases(cases,{status:'open',query:' comedy '}).map(x=>x.id),['a']);
  assert.equal(filterSupportCases(cases,{query:'buyer@example.com'}).length,1);
  assert.equal(filterSupportCases(cases,{status:'resolved',query:'TB-123'}).length,0);
  assert.equal(supportCaseHref('a&scope=admin'),'/support?case=a%26scope%3Dadmin');
});
test('support gateway cannot forward an unauthenticated read or write',async()=>{
  const old=global.fetch;let calls=0;
  global.fetch=async()=>{calls++;throw Error('Must not contact upstream');};
  try {
    for(const method of ['GET','POST']) {
      const res={setHeader(){},status(value){this.code=value;return this;},json(value){this.data=value;return this;}};
      await handler({query:{endpoint:'ticketbunker-support',scope:'admin'},method,headers:{},body:{action:'create'}},res);
      assert.equal(res.code,401);
    }
    assert.equal(calls,0);
  } finally {global.fetch=old;}
});
test('a response arriving after sign-out cannot restore private support case data',async()=>{
  let release,started;
  const startedPromise=new Promise(resolve=>{started=resolve;});
  const pending=new Promise(resolve=>{release=resolve;});
  const {context,get}=supportRuntime(async()=>{started();return pending;});
  const reading=context.test.loadCases();
  await startedPromise;
  context.test.showSignedOut();
  release({cases:[{id:'private',subject:'Private enquiry',status:'open'}]});
  await assert.rejects(reading,/account session changed/);
  assert.equal(context.test.getCases().length,0);
  assert.equal(get('#case-list').children.length,0);
  assert.equal(get('#support-workspace').hidden,true);
});
test('customers can load subsequent case pages without switching to staff scope',async()=>{
  const calls=[];
  const {context}=supportRuntime(async path=>{
    calls.push(path);
    return calls.length===1?{cases:[{id:'first',status:'open'}],hasMore:true,nextOffset:100}:{cases:[{id:'next',status:'open'}],hasMore:false};
  });
  await context.test.loadCases();
  assert.equal(context.test.getOffset(),100);
  await context.test.loadCases(false);
  assert.deepEqual(calls,['ticketbunker-support?scope=customer','ticketbunker-support?scope=customer&offset=100']);
  assert.deepEqual(Array.from(context.test.getCases(),item=>item.id),['first','next']);
  assert.equal(context.test.getOffset(),null);
});
test('support sign-in return links remain local and are explicitly allowlisted',()=>{
  const source=readFileSync(new URL('../shared.js',import.meta.url),'utf8').replaceAll('export ','')+'\nthis.next=safeNext;';
  const context={URL,Intl,location:{origin:'https://theticketbunker.com'}};
  vm.runInNewContext(source,context);
  assert.equal(context.next('/support?case=123'),'/support?case=123');
  assert.equal(context.next('/support-admin?case=123'),'/support-admin?case=123');
  assert.equal(context.next('https://evil.example/support'),'');
  assert.equal(context.next('//evil.example/support-admin'),'');
  assert.equal(context.next('/api/ticketbunker-support'),'');
});
test('existing ticket refund action opens a tracked case with a stable request ID and never calls payment endpoints',async()=>{
  const source=readFileSync(new URL('../account.js',import.meta.url),'utf8');
  const body=source.split("$('#ticket-form').onsubmit=async e=>{")[1].split('\n};\n(async()=>{')[0];
  assert.ok(body,'existing refund handler found');
  const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{disabled:false,textContent:'',value:'The event changed and I need a refund review.',append(child){this.child=child;},close(){this.closed=true;},classList:{add(){}}});return nodes.get(id);};
  const calls=[];
  const context={$:get,change:{action:'refund',clientRequestId:'stable-attempt',ticket:{id:'ticket-id',title:'Comedy'}},
    currentToken:async()=> 'verified-token',document:{createElement:()=>({})},encodeURIComponent,
    api:async(path,payload)=>{calls.push({path,payload});return {case:{id:'case-id',reference:'TB-100'},notification:{state:'queued'}};}};
  vm.runInNewContext('this.submit=async e=>{'+body+'\n};',context);
  await context.submit({preventDefault(){}});await context.submit({preventDefault(){}});
  assert.ok(calls.every(x=>x.path==='ticketbunker-support'));
  assert.equal(calls[0].payload.category,'refund');assert.equal(calls[0].payload.ticketId,'ticket-id');
  assert.equal(calls[0].payload.clientRequestId,calls[1].payload.clientRequestId);
  assert.match(get('#tickets-status').textContent,/does not issue a refund/);
  assert.match(get('#tickets-status').textContent,/queued/);
  assert.equal(get('#tickets-status').child.href,'/support?case=case-id');
});
