import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mixSellers,sortItems,filterItems} from '../discovery-model.js';
import cityHandler,{cityHtml} from '../api/city-page.js';
import {cityBySlug} from '../city-places.js';
const now=Date.parse('2026-11-23T12:00:00Z');
const item=(key,source,over={})=>({key,source,title:key,city:'London',countryCode:'GB',category:'daysout',startsAt:'2026-11-24T20:00:00Z',timezone:'Europe/London',soldOut:false,...over});

test('discovery mixes providers before pagination and gives our source the first ordinary turn',()=>{
  const own=Array.from({length:80},(_,n)=>item('own'+n,'ticketbunker',{startsAt:new Date(now+(n+1)*864e5).toISOString()}));
  const skiddle=Array.from({length:80},(_,n)=>item('skiddle'+n,'skiddle',{startsAt:new Date(now+(n+1)*864e5).toISOString()}));
  const viator=[item('viator1','viator',{startsAt:''}),item('viator2','viator',{startsAt:''})];
  const input=sortItems([...own,...skiddle,...viator]),snapshot=[...input],mixed=mixSellers(input);
  assert.deepEqual(mixed.slice(0,6).map(i=>i.source),['ticketbunker','skiddle','viator','ticketbunker','skiddle','viator']);
  assert.equal(mixed.length,input.length);
  assert.equal(new Set(mixed.map(i=>i.key)).size,input.length);
  assert.deepEqual(input,snapshot,'input order is not mutated');
  for(const source of ['ticketbunker','skiddle','viator'])assert.deepEqual(mixed.filter(i=>i.source===source),input.filter(i=>i.source===source),'chronology stays stable within '+source);
});

test('paid featured listings lead while sold-out listings remain behind on-sale inventory',()=>{
  const ordinary=item('native','ticketbunker'),featured=item('featured','skiddle',{featured:true}),sold=item('sold-featured','ticketbunker',{featured:true,soldOut:true});
  assert.deepEqual(mixSellers([ordinary,sold,item('tour','viator',{startsAt:''}),featured]).map(i=>i.key),['featured','native','tour','sold-featured']);
});

test('mixing retains one copy of each listing reference and supports raw provider feed items',()=>{
  const a={id:'skiddle:1',provider:'skiddle'},b={id:'skiddle:2',provider:'skiddle'},v={id:'viator:1',provider:'viator'};
  assert.deepEqual(mixSellers([a,b,v,a]).map(i=>i.id),['skiddle:1','viator:1','skiddle:2']);
  assert.deepEqual(mixSellers([]),[]);
});

test('country/category filters apply before mixing and date searches keep chronological order',()=>{
  const early=item('early','skiddle'),later=item('later','ticketbunker',{startsAt:'2026-11-25T20:00:00Z'}),open=item('open','viator',{startsAt:''});
  const pool=[later,open,early,item('elsewhere','viator',{city:'Paris',countryCode:'FR',startsAt:''}),item('different-category','viator',{category:'boat',startsAt:''})];
  const any=sortItems(filterItems(pool,{country:'GB',city:'London',category:'daysout',when:'any'},now));
  assert.deepEqual(mixSellers(any).map(i=>i.key),['later','early','open']);
  const dated=sortItems(filterItems(pool,{country:'GB',city:'London',category:'daysout',when:'week'},now));
  assert.deepEqual(mixSellers(dated,{when:'week'}).map(i=>i.key),['early','later']);
  assert.ok(!mixSellers(dated,{when:'week'}).some(i=>!i.startsAt),'unknown date availability is not invented');
});

test('server city list also mixes raw feed providers before its thirty-item limit',()=>{
  const shell=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const skiddle=Array.from({length:40},(_,n)=>({id:'skiddle:'+n,provider:'skiddle',title:'Show '+n,url:'https://www.skiddle.com/e/'+n+'/',startsAt:new Date(now+(n+1)*864e5).toISOString(),city:'London',countryCode:'GB'}));
  const tour={id:'viator:123',provider:'viator',title:'Open-dated river cruise',url:'https://www.viator.com/tours/London/123?pid=P00333211',startsAt:'',city:'London',countryCode:'GB'};
  const html=cityHtml(shell,cityBySlug('london'),[...skiddle,tour]);
  const list=html.match(/<ol class="city-list">([\s\S]*?)<\/ol>/)?.[1]||'';
  assert.equal((list.match(/<li>/g)||[]).length,30);
  assert.ok(list.indexOf('Open-dated river cruise')<list.indexOf('Show 1</a>'),'an undated provider is visible before the dated source exhausts the page');
  assert.match(list,/\/listing\/viator%3A123/);
});

test('city HTML adds no more than twenty minutes of cache age to provider data',async()=>{
  const original=globalThis.fetch,headers={};
  const res={setHeader:(name,value)=>{headers[name]=value;},status(code){this.statusCode=code;return this;},send(body){this.body=body;return this;}};
  try{
    globalThis.fetch=async()=>({ok:true,json:async()=>({events:[]})});
    await cityHandler({method:'HEAD',query:{slug:'london'}},res);
    assert.equal(res.statusCode,200);
    const maxAge=[...headers['Cache-Control'].matchAll(/(?:s-maxage|stale-while-revalidate)=(\d+)/g)].reduce((n,m)=>n+Number(m[1]),0);
    assert.ok(maxAge>0&&maxAge<=20*60,'the HTML cache fits the fifty-minute feed-plus-page budget');
  }finally{globalThis.fetch=original;}
});
