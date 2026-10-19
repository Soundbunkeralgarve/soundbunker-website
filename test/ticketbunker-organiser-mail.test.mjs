import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {ticketBunkerEmailContent} from '../api/lib/ticketbunker-email-template.js';

async function fixture({confirmed=true,payments=false,kind='verified',tax=false,fail=false}={}){
 const organiser={id:'org',owner_user_id:'owner',display_name:'Example Events',country_code:'PT',status:'approved',stripe_capabilities_ready:true,tax_review_complete:tax};
 const user={id:'owner',email:'owner@example.invalid',email_confirmed_at:confirmed?'2026-01-01':null};
 const job={id:'job',organiser_id:'org',kind,status:'pending',attempts:0,lease_token:'lease'},sent=[];
 const db={rpc:async()=>{if(job.status!=='pending')return {data:null};job.status='sending';job.attempts++;return {data:{...job}}},auth:{admin:{getUserById:async()=>({data:{user}})}},from(table){const q={select(){return q},eq(){return q},update(patch){q.patch=patch;return q},single:async()=>({data:organiser}),maybeSingle:async()=>({data:{legal_name:'Example Events Ltd',contact_name:'Alex',tax_id:'SECRET-TAX'}}),then(resolve){if(q.patch)Object.assign(job,q.patch);return Promise.resolve({}).then(resolve)}};return q}};
 const context=vm.createContext({console,Date});
 const exports={'./notify.js':{sendTransactionalEmail:async payload=>{sent.push(payload);if(fail)throw Object.assign(Error('Provider busy'),{status:429,retryable:true});return {id:'email_accepted'}}},'./ticketbunker-stripe.js':{ticketBunkerPaymentsEnabled:()=>payments}};
 const m=new vm.SourceTextModule(await readFile(new URL('../api/lib/organiser-onboarding-mail.js',import.meta.url),'utf8'),{context});await m.link(spec=>{const values=exports[spec];return new vm.SyntheticModule(Object.keys(values),function(){for(const [k,v]of Object.entries(values))this.setExport(k,v)},{context})});await m.evaluate();
 return {job,sent,organiser,user,run:()=>m.namespace.processOrganiserMail(db,{id:job.id}),message:()=>m.namespace.organiserOnboardingMessage(kind,{organiser,user,paymentsEnabled:payments})};
}
test('verified owner welcome is accepted once, confirms useful details and keeps sensitive fields out',async()=>{
 const f=await fixture();assert.equal((await f.run()).status,'accepted');assert.equal((await f.run()).status,'held');assert.equal(f.sent.length,1);const p=f.sent[0];assert.equal(p.to,f.user.email);assert.equal(p.personal,true);assert.match(p.text,/billing and tax/);assert.match(p.text,/event-scanner/);assert.match(p.text,/App Store app: coming soon/);assert.match(p.text,/Thanks,\nSteve/);assert.doesNotMatch(p.text,/SECRET-TAX/);assert.equal(f.job.provider_id,'email_accepted');
 const rendered=ticketBunkerEmailContent(p.text,p.artwork);assert.match(rendered.html,/app-store-coming-soon.png/);assert.match(rendered.html,/Open organiser portal/);assert.doesNotMatch(rendered.html,/href="[^"]*app-store/);
});
test('unverified email cannot receive the welcome',async()=>{const f=await fixture({confirmed:false});assert.equal((await f.run()).status,'failed');assert.equal(f.sent.length,0);assert.throws(f.message,/Verified organiser owner/);});
test('ready email waits for payment activation and requires completed billing review',async()=>{
 const held=await fixture({kind:'ready',tax:true});assert.equal((await held.run()).status,'held');assert.equal(held.job.first_attempt_at,null);assert.equal(held.sent.length,0);
 const invalid=await fixture({kind:'ready',payments:true});assert.equal((await invalid.run()).status,'failed');assert.equal(invalid.sent.length,0);
 const ready=await fixture({kind:'ready',payments:true,tax:true});assert.equal((await ready.run()).status,'accepted');assert.match(ready.sent[0].text,/account checks are complete/);
});
test('retry freezes recipient, content and provider idempotency key',async()=>{const f=await fixture({fail:true});assert.equal((await f.run()).status,'pending');f.organiser.display_name='Changed';f.user.email='changed@example.invalid';assert.equal((await f.run()).status,'pending');assert.equal(f.sent.length,2);assert.equal(JSON.stringify(f.sent[0]),JSON.stringify(f.sent[1]));assert.equal(f.job.attempts,2);});
