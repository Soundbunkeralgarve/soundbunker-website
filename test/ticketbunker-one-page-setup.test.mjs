import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../ticketbunker-site/'+p,import.meta.url),'utf8');
const html=read('organiser.html'),js=read('organiser-v2.js'),landing=read('for-organisers.html');

test('organiser login, profile, logo, billing and Stripe verification share one setup page',()=>{
 const onboarding=html.slice(html.indexOf('id="onboarding"'),html.indexOf('id="page-verification"'));
 for(const id of ['setup-steps','signup-form','signup-confirm','register-form','onboarding-logo','billing-form','onboarding-verify-slot'])assert.match(onboarding,new RegExp('id="'+id+'"'));
 assert.deepEqual([...onboarding.matchAll(/<h2[^>]*>(0\d) \//g)].map(m=>m[1]),['01','01','02','03','04','05']);
 assert.match(html,/id="verification-panel"/);
});

test('signed-out organisers stay on the setup page instead of bouncing to a separate login',()=>{
 const boot=js.slice(js.indexOf('async function boot'),js.indexOf('async function startPortal'));
 assert.match(boot,/if\(!session\)\{showSignupStep\(\);return;\}/);
 assert.doesNotMatch(boot,/location\.replace\('\/login/);
 assert.match(js,/location\.replace\('\/organiser'\)/);
 assert.match(landing,/href="\/organiser\?signup=1"/);
 assert.doesNotMatch(landing,/mode=signup/);
});

test('sign-up confirmation returns through the existing allow-listed login redirect',()=>{
 assert.match(js,/SIGNUP_RETURN='\/login\?role=organiser&next='\+encodeURIComponent\('\/organiser'\)/);
 assert.match(js,/emailRedirectTo:location\.origin\+SIGNUP_RETURN/);
 assert.match(js,/sb\.auth\.resend\(\{type:'signup'/);
 assert.match(js,/!form\.elements\.acceptTerms\.checked\?'Accept the terms/);
});

test('saving billing opens Stripe verification in place and never claims success from an exit',()=>{
 const save=js.slice(js.indexOf('async function saveBilling'),js.indexOf("$('#billing-form').addEventListener"));
 assert.match(save,/if\(form\.id==='billing-form'\)void showVerificationStep\(\);/);
 assert.doesNotMatch(save,/page\('verification'\)/);
 const step=js.slice(js.indexOf('async function showVerificationStep'),js.indexOf('function setSignupMode'));
 assert.match(step,/await loadStripeStatus\(\);/);
 assert.match(step,/connectState\?\.canOnboard===true&&!connectState\.ready/);
 assert.match(js,/\$\('#onboarding-finish'\)\.hidden=!\(s\.ready\|\|s\.state==='under_review'\)/);
 assert.match(js,/function page\(name\)\{[^}]*\}dockVerification\(false\)/);
});
