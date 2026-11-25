import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/integration-check.js';
function response(){return {headers:{},code:null,value:null,setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(v){this.value=v;return this;}};}
async function withEnv(values,fn){const old=Object.fromEntries(Object.keys(values).map(k=>[k,process.env[k]]));try{for(const[k,v]of Object.entries(values))v===undefined?delete process.env[k]:process.env[k]=v;return await fn();}finally{for(const[k,v]of Object.entries(old))v===undefined?delete process.env[k]:process.env[k]=v;}}
test('smoke endpoint is unavailable in production even with sandbox credentials',async()=>withEnv({VERCEL_ENV:'production',KAYAK_MODE:'sandbox',KAYAK_SANDBOX_API_KEY:'private-test-key'},async()=>{
 const res=response();await handler({method:'GET',query:{action:'kayak-flights'},headers:{}},res);assert.equal(res.code,404);assert.equal(JSON.stringify(res.value).includes('private-test-key'),false);
}));
test('preview status returns safe test-mode metadata without the key',async()=>withEnv({VERCEL_ENV:'preview',KAYAK_MODE:'sandbox',KAYAK_SANDBOX_API_KEY:'private-test-key'},async()=>{
 const res=response();await handler({method:'GET',query:{action:'status'},headers:{}},res);assert.equal(res.code,200);assert.equal(res.value.testData,true);assert.equal(res.value.live,false);assert.equal(res.value.canServePublic,false);assert.equal(JSON.stringify(res.value).includes('private-test-key'),false);
}));
test('preview map checks cannot be used as an arbitrary network proxy',async()=>withEnv({VERCEL_ENV:'preview'},async()=>{
 const res=response();await handler({method:'GET',query:{action:'map',provider:'https://example.com/steal',method:'GET'},headers:{}},res);assert.equal(res.code,400);
}));
test('sandbox smoke forwards actual browser context from trusted edge headers without returning it',async()=>withEnv({VERCEL_ENV:'preview',KAYAK_MODE:'sandbox',KAYAK_SANDBOX_API_KEY:'private-test-key'},async()=>{
 const before=globalThis.fetch;let captured;
 globalThis.fetch=async(url,init)=>{captured=init.headers;const body={isComplete:true,currencyCode:'USD',results:[]};return {ok:true,status:200,json:async()=>body,clone:()=>({json:async()=>body})};};
 try{const res=response();await handler({method:'GET',query:{action:'kayak-hotels'},headers:{'user-agent':'Actual Test Browser/1.0','x-vercel-forwarded-for':'203.0.113.7','x-forwarded-for':'198.51.100.20'}},res);assert.equal(res.code,200);assert.equal(captured['User-Agent'],'Actual Test Browser/1.0');assert.equal(captured['x-original-client-ip'],'203.0.113.7');assert.equal(JSON.stringify(res.value).includes('203.0.113.7'),false);assert.equal(res.value.testData,true);assert.equal(res.value.bookable,false);}finally{globalThis.fetch=before;}
}));
test('private diagnostics redact supplier echoes of credentials and client addresses',async()=>withEnv({VERCEL_ENV:'preview',KAYAK_MODE:'sandbox',KAYAK_SANDBOX_API_KEY:'private-test-key'},async()=>{
 const before=globalThis.fetch;
 globalThis.fetch=async()=>{const body={errorCode:'INVALID_INPUT',errorMessage:'Rejected 203.0.113.7 and private-test-key at https://example.com/?apiKey=private-test-key'};return {ok:false,status:400,json:async()=>body,clone:()=>({json:async()=>body})};};
 try{const res=response();await handler({method:'GET',query:{action:'kayak-hotels'},headers:{'user-agent':'Actual Test Browser/1.0','x-vercel-forwarded-for':'203.0.113.7'}},res);const out=JSON.stringify(res.value);assert.equal(res.value.error,'KAYAK_UNAVAILABLE');assert.equal(out.includes('203.0.113.7'),false);assert.equal(out.includes('private-test-key'),false);assert.equal(out.includes('https://example.com'),false);}finally{globalThis.fetch=before;}
}));
test('pending hotel checks reuse one search context until results complete',async()=>withEnv({VERCEL_ENV:'preview',KAYAK_MODE:'sandbox',KAYAK_SANDBOX_API_KEY:'private-test-key'},async()=>{
 const before=globalThis.fetch, ids=[];let count=0;
 globalThis.fetch=async(url)=>{ids.push(new URL(url).searchParams.get('userTrackId'));const body=++count===1?{isComplete:false,currencyCode:'USD'}:{isComplete:true,currencyCode:'USD',results:[]};return {ok:true,status:200,json:async()=>body,clone:()=>({json:async()=>body})};};
 try{const res=response();await handler({method:'GET',query:{action:'kayak-hotels'},headers:{'user-agent':'Actual Test Browser/1.0','x-vercel-forwarded-for':'203.0.113.7'}},res);assert.equal(res.value.complete,true);assert.equal(count,2);assert.equal(new Set(ids).size,1);assert.equal(res.value.live,false);assert.equal(res.value.bookable,false);}finally{globalThis.fetch=before;}
}));
