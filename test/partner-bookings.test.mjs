import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createPartnerBookingsHandler,bookingDocument,bookingUrl} from '../api/lib/partner-bookings.js';

const userId='11111111-1111-4111-8111-111111111111',otherId='22222222-2222-4222-8222-222222222222';
const row=(overrides={})=>({id:randomUUID(),user_id:userId,request_id:randomUUID(),source:'manual',provider_id:'viator',provider_name:'Viator',title:'Lisbon sunset cruise',starts_at:null,venue:'Lisbon',booking_url:'https://www.viator.com/tours/Lisbon/cruise',booking_reference:'',listing_id:'',status:'saved',verification_source:'none',document_path:null,document_name:'',created_at:'2026-11-25T00:00:00.000Z',updated_at:'2026-11-25T00:00:00.000Z',...overrides});
function fixture(initial=[],auth={user:{id:userId,email_confirmed_at:'2026-11-25'},admin:null}){
 const rows=structuredClone(initial),storageCalls=[],objects=new Map();let race=false;
 const storage={
  upload:async(path,bytes,options)=>{storageCalls.push(['upload',path,options]);objects.set(path,bytes);return {data:{path}};},
  remove:async paths=>{storageCalls.push(['remove',paths]);for(const path of paths)objects.delete(path);return {data:[]};},
  createSignedUrl:async(path,seconds,options)=>{storageCalls.push(['sign',path,seconds,options]);return {data:{signedUrl:'https://example.supabase.co/storage/v1/object/sign/tb-partner-bookings/'+path+'?token=short-lived'}};}
 };
 const db={from(){
  let action='select',fields,filters=[],single=false,limit=Infinity;
  const query={select(){return this;},eq(key,value){filters.push([key,value]);return this;},order(){return this;},limit(n){limit=n;return this;},insert(value){action='insert';fields=value;return this;},update(value){action='update';fields=value;return this;},delete(){action='delete';return this;},maybeSingle(){single=true;return this;},single(){single=true;return this;},then(resolve,reject){
   try{let selected=rows.filter(item=>filters.every(([key,value])=>item[key]===value)).slice(0,limit);
    if(action==='insert'){const added=row(fields);rows.push(added);selected=[added];}
    if(action==='update'){if(race)selected=[];for(const item of selected)Object.assign(item,fields);}
    if(action==='delete')for(const item of selected)rows.splice(rows.indexOf(item),1);
    return Promise.resolve({data:structuredClone(single?selected[0]||null:selected),error:null}).then(resolve,reject);
   }catch(error){return Promise.reject(error).then(resolve,reject);}
  }};return query;
 },storage:{from(bucket){assert.equal(bucket,'tb-partner-bookings');return storage;}}};
 const handler=createPartnerBookingsHandler({requireUser:async()=>({...auth,admin:db}),json:(res,data,status=200)=>{res.status=status;res.data=data;},parseJson:async req=>req.body,logger:{error(){}}});
 async function request(body,method=body?'POST':'GET'){const res={headers:{},setHeader(name,value){this.headers[name]=value;}};await handler({method,headers:{},body},res);return res;}
 return {rows,request,storageCalls,objects,setRace:()=>{race=true;}};
}
const save={action:'save',providerId:'viator',providerName:'Viator',title:'Lisbon sunset cruise',bookingUrl:'https://www.viator.com/tours/Lisbon/cruise'};
const pdf=Buffer.from('%PDF-1.7\nhello ticket\n%%EOF').toString('base64');

test('requires a signed-in account and a verified email',async()=>{
 assert.equal((await fixture([],{error:'Session expired',status:401}).request()).status,401);
 assert.equal((await fixture([],{user:{id:userId}}).request()).status,403);
});
test('lists only owned bookings and never exposes storage paths',async()=>{
 const own=row({document_path:userId+'/private/ticket.pdf',document_name:'ticket.pdf'}),f=fixture([own,row({user_id:otherId})]);
 const result=await f.request();assert.equal(result.status,200);assert.equal(result.data.bookings.length,1);assert.equal(result.data.bookings[0].id,own.id);assert.equal(result.data.bookings[0].hasDocument,true);assert.ok(!JSON.stringify(result.data).includes('private/ticket.pdf'));
});
test('every existing-booking action blocks cross-account access before touching storage',async()=>{
 for(const action of ['update','remove','document','download']){
  const foreign=row({user_id:otherId}),f=fixture([foreign]);
  const result=await f.request({action,bookingId:foreign.id,title:'Hijacked',fileName:'ticket.pdf',mimeType:'application/pdf',base64:pdf});
  assert.equal(result.status,404,action);assert.equal(f.rows[0].title,foreign.title);assert.equal(f.storageCalls.length,0);
 }
});
test('clients cannot set ownership, provider verification or storage paths',async()=>{
 for(const extra of [{userId:otherId},{user_id:otherId},{status:'provider_confirmed'},{verificationSource:'provider'},{document_path:'foreign/ticket.pdf'}]){
  const f=fixture(),result=await f.request({...save,...extra});assert.equal(result.status,400);assert.equal(f.rows.length,0);
 }
});
test('customer-added bookings remain customer supplied, and can omit an external URL',async()=>{
 const f=fixture(),result=await f.request({...save,bookingUrl:'',customerReported:true});
 assert.equal(result.status,200);assert.equal(result.data.booking.status,'customer_added');assert.equal(result.data.booking.verificationSource,'customer');assert.equal(f.rows[0].user_id,userId);
});
test('automatic click saves derive their real supplier from the URL and stay unconfirmed',async()=>{
 const f=fixture(),result=await f.request({...save,source:'click',providerId:'fake',providerName:'Fake supplier',customerReported:true});
 assert.equal(result.status,200);assert.equal(result.data.booking.providerId,'viator');assert.equal(result.data.booking.providerName,'Viator');assert.equal(result.data.booking.status,'saved');assert.equal(result.data.booking.verificationSource,'none');
});
test('Awin clicks record the merchant, and unknown click suppliers are rejected',async()=>{
 const f=fixture(),good=await f.request({...save,source:'click',bookingUrl:'https://www.awin1.com/cread.php?awinmid=24761&ued=https%3A%2F%2Fwww.entradas.com%2F'});
 assert.equal(good.data.booking.providerId,'entradas');
 assert.equal((await f.request({...save,source:'click',bookingUrl:'https://www.awin1.com/cread.php?awinmid=999999'})).status,400);
 assert.equal((await f.request({...save,source:'click',bookingUrl:'https://unknown-supplier.example/booking'})).status,400);
});
test('repeated clicks return the existing owner booking without overwriting references or confirmation',async()=>{
 const own=row({status:'customer_added',verification_source:'customer',booking_reference:'REF-123'}),f=fixture([own,row({user_id:otherId})]);
 const result=await f.request({...save,source:'click',title:'Overwrite attempt'});
 assert.equal(result.data.booking.id,own.id);assert.equal(result.data.booking.bookingReference,'REF-123');assert.equal(result.data.booking.status,'customer_added');assert.equal(f.rows.length,2);
});
test('manual saves are idempotent per account request ID',async()=>{
 const f=fixture(),requestId=randomUUID();await f.request({...save,requestId});await f.request({...save,requestId});assert.equal(f.rows.length,1);
});
test('rejects unsafe ticket links while preserving approved HTTPS tracking fields',()=>{
 for(const url of ['http://viator.com/','javascript:alert(1)','https://viator.com@evil.example/','https://127.0.0.1/x','https://[::1]/x','https://localhost/x','https://internal.local/x','https://theticketbunker.com/event-ticket','https://viator.com:8443/x'])assert.throws(()=>bookingUrl(url),undefined,url);
 const url='https://www.viator.com/tours/123?pid=P00333211&campaign=tb-limos';assert.equal(bookingUrl(url),url);
});
test('validates uploaded bytes rather than trusting MIME or file extension',()=>{
 assert.equal(bookingDocument({fileName:'ticket.pdf',mimeType:'application/pdf',base64:pdf}).mime,'application/pdf');
 for(const data of [{fileName:'ticket.pdf',mimeType:'application/pdf',base64:Buffer.from('<script>alert(1)</script>').toString('base64')},{fileName:'ticket.png',mimeType:'image/png',base64:pdf},{fileName:'ticket.svg',mimeType:'image/svg+xml',base64:pdf},{fileName:'ticket.pdf',mimeType:'application/pdf',base64:Buffer.alloc(2_000_001).toString('base64')}])assert.throws(()=>bookingDocument(data));
});
test('documents remain private, customer supplied and download links expire after 60 seconds',async()=>{
 const own=row(),f=fixture([own]);
 const added=await f.request({action:'document',bookingId:own.id,fileName:'ticket.pdf',mimeType:'application/pdf',base64:pdf});
 assert.equal(added.status,200);assert.equal(added.data.booking.hasDocument,true);assert.equal(added.data.booking.status,'customer_added');assert.equal(added.data.booking.verificationSource,'customer');assert.ok(!Object.hasOwn(added.data.booking,'documentPath'));
 const uploaded=f.storageCalls[0];assert.equal(uploaded[0],'upload');assert.ok(uploaded[1].startsWith(userId+'/'+own.id+'/'));assert.equal(uploaded[2].upsert,false);
 const downloaded=await f.request({action:'download',bookingId:own.id});assert.equal(downloaded.status,200);assert.ok(downloaded.data.url.includes('token=short-lived'));assert.equal(f.storageCalls[1][2],60);
});
test('customers cannot rewrite provider-confirmed or cancelled booking details or documents',async()=>{
 for(const status of ['provider_confirmed','cancelled'])for(const action of ['update','document']){
  const own=row({status,verification_source:'provider'}),f=fixture([own]);
  const result=await f.request({action,bookingId:own.id,title:'Different event',bookingReference:'Different ref',fileName:'ticket.pdf',mimeType:'application/pdf',base64:pdf});
  assert.equal(result.status,409);assert.equal(f.rows[0].title,own.title);assert.equal(f.rows[0].status,status);assert.equal(f.storageCalls.length,0);
 }
});
test('a concurrent document overwrite is rejected and its new upload is cleaned up',async()=>{
 const own=row(),g=fixture([own]);g.setRace();const stale=await g.request({action:'document',bookingId:own.id,fileName:'ticket.pdf',mimeType:'application/pdf',base64:pdf});assert.equal(stale.status,409);assert.equal(g.objects.size,0);
});
test('cannot sign a storage object outside the booking owner namespace',async()=>{
 const own=row({document_path:otherId+'/foreign/ticket.pdf'}),f=fixture([own]);assert.equal((await f.request({action:'download',bookingId:own.id})).status,404);assert.equal(f.storageCalls.length,0);
});
test('removing an owned record deletes its private document without touching other records',async()=>{
 const own=row(),foreign=row({user_id:otherId});own.document_path=userId+'/'+own.id+'/ticket.pdf';const f=fixture([own,foreign]);
 const result=await f.request({action:'remove',bookingId:own.id});assert.equal(result.status,200);assert.equal(f.rows.length,1);assert.equal(f.rows[0].id,foreign.id);assert.deepEqual(f.storageCalls,[['remove',[own.document_path]]]);
});
