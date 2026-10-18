import test from 'node:test';
import assert from 'node:assert/strict';
import {commercialPlans,prebookingQuote,usageQuote,ticketBunkerAdmin} from '../api/lib/ticketbunker-commercial.js';
import {taxExample,reservationUsageTerms} from '../ticketbunker-site/pricing-rules.js';
import {lookupScannerApp} from '../ticketbunker-site/api/scanner-store.js';

test('large-event deposit covers 2,000 sales and only the excess is deducted at payout',()=>{
 assert.equal(usageQuote('eur',0).totalCents,39900);
 for(const currency of ['eur','gbp'])for(const sold of [0,100,1999,2000]){const q=usageQuote(currency,sold);assert.equal(q.totalCents,39900);assert.equal(q.settlementFeeCents,0);assert.equal(q.billableTickets,0);assert.equal(q.includedTickets,2000);}
 assert.equal(usageQuote('eur',2000).totalCents,39900);
 assert.equal(usageQuote('eur',2001).totalCents,39915);
 const q=usageQuote('eur',4389);assert.equal(q.baseCents,39900);assert.equal(q.billableTickets,2389);assert.equal(q.settlementFeeCents,35835);assert.equal(q.totalCents,75735);
 assert.equal(usageQuote('eur',10000).totalCents,159900);
 for(const invalid of [-1,3.5,Infinity,NaN,Number.MAX_SAFE_INTEGER])assert.throws(()=>usageQuote('eur',invalid));assert.throws(()=>usageQuote('usd',100));
});
test('advertised fees contain IVA rather than adding tax on top',()=>{
 assert.deepEqual(taxExample(59900),{netCents:48699,taxCents:11201,totalCents:59900});
 assert.deepEqual(taxExample(80735),{netCents:65638,taxCents:15097,totalCents:80735});
 for(const plan of Object.values(commercialPlans)){const t=taxExample(plan.eur);assert.equal(t.netCents+t.taxCents,plan.eur);}
});
test('repeat event quotes use 5% and 10% without accepting other event counts',()=>{
 assert.equal(prebookingQuote('standard','eur',4).totalCents,75620);
 assert.equal(prebookingQuote('standard','eur',8).totalCents,143280);
 assert.equal(prebookingQuote('event_plus','eur',1).totalCents,39900);
 assert.throws(()=>prebookingQuote('usage','eur',4));assert.throws(()=>prebookingQuote('starter','eur',2));
});
test('admin authority requires verified email and server allowlist; metadata grants nothing',async()=>{
 let called=false;const admin={from(){called=true;return {select(){return this},eq(){return this},async maybeSingle(){return {data:null,error:null}}};}};
 assert.equal(await ticketBunkerAdmin({user:{email:'attacker@example.com',user_metadata:{role:'admin'}},admin}),false);assert.equal(called,false);
 assert.equal(await ticketBunkerAdmin({user:{email:'attacker@example.com',email_confirmed_at:'2026-01-01',user_metadata:{role:'admin'}},admin}),false);assert.equal(called,true);
});
const app={trackId:6823316315,bundleId:'pt.soundbunker.ticketbunkerscanner',wrapperType:'software',trackViewUrl:'https://apps.apple.com/pt/app/id6823316315'};
const appleResult=results=>async()=>({ok:true,json:async()=>({results})});
test('App Store download stays off for unavailable, mismatched or unsafe results',async()=>{
 for(const results of [[],[{...app,bundleId:'other'}],[{...app,trackId:1}],[{...app,trackViewUrl:'https://evil.example/app'}],[{...app,trackViewUrl:'javascript:alert(1)'}]])assert.deepEqual(await lookupScannerApp(appleResult(results)),{live:false});
 assert.deepEqual(await lookupScannerApp(async()=>{throw Error('offline')}),{live:false});
 assert.deepEqual(await lookupScannerApp(appleResult([app])),{live:true,url:app.trackViewUrl});
});

test('saved reservation displays its own allowance without rewriting older terms',()=>{
 assert.match(reservationUsageTerms({rate_cents:15,included_tickets:2000,currency:'gbp'}),/first 2,000 paid tickets; £0.15 per additional/);
 assert.match(reservationUsageTerms({rate_cents:15,included_tickets:0,currency:'eur'}),/first sale \(previous quote terms\)/);
 assert.equal(reservationUsageTerms({plan:'starter'}),'');
});
